"""Contract checks for the downloadable cPanel build artifact."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]

class ReleaseWorkflowTest(unittest.TestCase):
    def test_build_uploads_named_download_folder_after_tests(self):
        workflow = (ROOT / '.github/workflows/cpanel.yml').read_text()
        self.assertIn('branches: ["arena/7197db03-industrial-crm-project", "main"]', workflow)
        self.assertIn('tests/Feature/SecurityRegressionTest.php', workflow)
        self.assertIn('cpanel-download/cpanel-public.zip', workflow)
        self.assertIn('cpanel-download/cpanel-private.zip', workflow)
        self.assertIn('cpanel-download/SHA256SUMS', workflow)
        self.assertIn('cpanel-download/راهنمای-نصب.txt', workflow)
        self.assertGreater(workflow.index('actions/upload-artifact@v4'), workflow.index('tests/Feature/SecurityRegressionTest.php'))

if __name__ == '__main__':
    unittest.main()
