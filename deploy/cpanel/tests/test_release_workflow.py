"""Release-automation regression tests for .github/workflows/cpanel.yml.

The public/private ZIPs are published automatically, so a silent edit to the workflow can
either stop releases or publish untested archives. These tests pin the contract:
triggers, least-privilege permissions, rolling tag, idempotent re-upload and verification.

Run: python3 -m unittest discover -s deploy/cpanel/tests -v
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / '.github/workflows/cpanel.yml'
BUILD = ROOT / 'deploy/cpanel/build.sh'
DOWNLOAD_SH = ROOT / 'deploy/cpanel/download-release.sh'
DOWNLOAD_PS1 = ROOT / 'deploy/cpanel/download-release.ps1'

ROLLING_TAG = 'latest-build'

try:  # PyYAML is present on GitHub runners but not guaranteed on every dev machine.
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

YAML_AVAILABLE = yaml is not None


def read(path):
    return path.read_text(encoding='utf-8')


class WorkflowContractTest(unittest.TestCase):
    """Text-level checks: they run even without PyYAML installed."""

    def setUp(self):
        self.text = read(WORKFLOW)

    def assertHas(self, needle, why):
        self.assertIn(needle, self.text, f'missing "{needle}" — {why}')

    def test_triggers_cover_main_tags_pr_and_manual(self):
        self.assertHas('branches: [main]', 'every push to main must rebuild and refresh the rolling release')
        self.assertHas("tags: ['v*']", 'a version tag must publish a versioned release')
        self.assertHas('pull_request:', 'pull requests must still be built and tested')
        self.assertHas('workflow_dispatch:', 'a manual rebuild must stay available')

    def test_workflow_is_least_privilege_by_default(self):
        # Only the publishing job may write; everything else stays read-only.
        self.assertHas('permissions:\n  contents: read', 'workflow-wide default must be read-only')
        self.assertEqual(self.text.count('contents: write'), 1,
                         'exactly one job may hold contents: write')

    def test_release_job_depends_on_package_and_skips_pull_requests(self):
        self.assertHas('needs: package', 'releases must publish only archives that passed every test')
        condition = re.search(r"if: >-\n((?:\s+.+\n)+)", self.text)
        self.assertIsNotNone(condition, 'the release job needs an explicit if condition')
        body = condition.group(1)
        self.assertIn("github.event_name == 'push'", body, 'merged commits and tags must publish')
        self.assertNotIn('pull_request', body, 'a pull request must never publish a release')

    def test_rolling_release_is_idempotent_and_never_steals_latest(self):
        self.assertHas(ROLLING_TAG, f'the rolling tag must be "{ROLLING_TAG}" so its download URL never changes')
        self.assertHas('--clobber', 're-running the workflow must replace assets instead of failing')
        self.assertHas('--latest=false', 'the rolling release must not take the GitHub "Latest" badge')
        self.assertHas('--verify-tag', 'a versioned release must point at a tag that really exists')

    def test_archives_are_verified_before_publishing(self):
        self.assertHas('sha256sum -c SHA256SUMS', 'the downloaded artifact must be checksum-verified')
        self.assertHas('verify-package.sh cpanel-release', 'the artifact must pass the layout/sensitive-file verifier')

    def test_artifact_contains_both_archives_and_metadata(self):
        for needle in ('cpanel-release/cpanel-public.zip', 'cpanel-release/cpanel-private.zip',
                       'cpanel-release/SHA256SUMS', 'cpanel-release/build-info.txt'):
            self.assertHas(needle, 'the CI artifact must carry the published files')
        self.assertHas('if-no-files-found: error', 'an empty artifact must fail the run, not pass silently')

    def test_concurrency_prevents_racing_release_writes(self):
        self.assertHas('concurrency:', 'two pushes to main must not write the same release tag at once')
        self.assertHas('cancel-in-progress:', 'superseded pull-request builds should be cancelled')

    def test_build_identity_is_passed_to_the_build_script(self):
        for var in ('CPANEL_BUILD_VERSION', 'CPANEL_BUILD_BRANCH', 'CPANEL_BUILD_COMMIT'):
            self.assertHas(var, f'{var} makes every ZIP traceable to one version and one commit')
            self.assertIn(var, read(BUILD), f'build.sh must consume {var}')


class DownloaderContractTest(unittest.TestCase):
    """The helper scripts must agree with the workflow about the rolling tag and file names."""

    def test_default_tag_matches_the_rolling_release(self):
        self.assertIn(f'TAG="${{1:-{ROLLING_TAG}}}"', read(DOWNLOAD_SH))
        self.assertIn(f"$Tag = '{ROLLING_TAG}'", read(DOWNLOAD_PS1))

    def test_both_archives_are_downloaded_and_verified(self):
        for script in (DOWNLOAD_SH, DOWNLOAD_PS1):
            text = read(script)
            for name in ('cpanel-public.zip', 'cpanel-private.zip'):
                self.assertIn(name, text, f'{script.name} must fetch {name}')
            self.assertIn('SHA256SUMS', text, f'{script.name} must verify checksums')

    def test_downloaded_files_land_in_the_release_folder(self):
        self.assertIn('cpanel-release', read(DOWNLOAD_SH))
        self.assertIn('cpanel-release', read(DOWNLOAD_PS1))
        # The output folder stays out of Git; archives are downloaded, never committed.
        self.assertIn('cpanel-release/', read(ROOT / '.gitignore'))


@unittest.skipUnless(YAML_AVAILABLE, 'PyYAML is not installed')
class WorkflowStructureTest(unittest.TestCase):
    """Structural checks that need a real YAML parser."""

    @classmethod
    def setUpClass(cls):
        cls.wf = yaml.safe_load(read(WORKFLOW))
        # "on" is a YAML 1.1 boolean key.
        cls.triggers = cls.wf.get('on') or cls.wf.get(True)

    def test_trigger_shape(self):
        self.assertEqual(sorted(self.triggers), sorted(['push', 'pull_request', 'workflow_dispatch']))
        self.assertEqual(self.triggers['push']['branches'], ['main'])
        self.assertEqual(self.triggers['push']['tags'], ['v*'])

    def test_jobs_and_permissions(self):
        self.assertEqual(sorted(self.wf['jobs']), ['package', 'release'])
        self.assertEqual(self.wf['permissions'], {'contents': 'read'})
        release = self.wf['jobs']['release']
        self.assertEqual(release['needs'], 'package')
        self.assertEqual(release['permissions'], {'contents': 'write'})
        self.assertNotIn('permissions', self.wf['jobs']['package'],
                         'the build job must inherit the read-only default')

    def test_every_run_block_is_a_shell_script(self):
        for job_name, job in self.wf['jobs'].items():
            self.assertTrue(job.get('steps'), f'{job_name} has no steps')
            for step in job['steps']:
                if 'run' in step:
                    self.assertTrue(step['run'].strip(), f'{job_name}: empty run block')
                    # A stray GitHub expression inside a quoted string is the usual breakage.
                    self.assertNotRegex(step['run'], r'\$\{\{\s*\}\}', f'{job_name}: empty expression')

    def test_upload_artifact_paths_exist_as_release_files(self):
        upload = [s for s in self.wf['jobs']['package']['steps']
                  if str(s.get('uses', '')).startswith('actions/upload-artifact')]
        self.assertEqual(len(upload), 1)
        paths = upload[0]['with']['path']
        self.assertIn('cpanel-release/*.zip', paths)


if __name__ == '__main__':
    unittest.main()
