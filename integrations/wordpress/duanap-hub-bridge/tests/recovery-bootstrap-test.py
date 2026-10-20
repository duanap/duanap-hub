"""Static config guards must refuse wrong targets without loading WordPress."""
import argparse,json,pathlib,subprocess,tempfile,unittest
p=argparse.ArgumentParser();p.add_argument('--php',default='php');args,remaining=p.parse_known_args()
helper=pathlib.Path(__file__).with_name('fixture-bootstrap.php')

class BootstrapGuards(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        self.root=pathlib.Path(self.directory.name);self.marker=self.root/'loaded'
        (self.root/'duanap-hub-fixture.marker').write_text('isolated')
        (self.root/'wp-load.php').write_text('<?php file_put_contents('+json.dumps(str(self.marker))+',"loaded");')
        mu=self.root/'wp-content/mu-plugins';mu.mkdir(parents=True)
        (mu/'000-duanap-test-isolation.php').write_bytes(helper.with_name('fixture-isolation.php').read_bytes())
        self.settings={'DB_NAME':'hub_p2_audit_a12b34','DB_USER':'hub_p2_audit_a12b34','DB_PASSWORD':'synthetic-only','DB_HOST':'localhost:/run/mysqld/mysqld.sock','WP_HOME':'http://127.0.0.1:1030','WP_SITEURL':'http://127.0.0.1:1030','WP_ENVIRONMENT_TYPE':'development','DUANAP_HUB_TEST_FIXTURE':True,'WP_HTTP_BLOCK_EXTERNAL':True,'DISABLE_WP_CRON':True}
    def run_config(self,changes=None,suffix=''):
        settings=dict(self.settings,**(changes or {}))
        config='<?php\n'+''.join('define('+json.dumps(k)+','+json.dumps(v)+');\n' for k,v in settings.items())+suffix
        (self.root/'wp-config.php').write_text(config)
        result=subprocess.run([args.php,str(helper),str(self.root)],capture_output=True)
        self.assertFalse(self.marker.exists(),'Static validation must never run wp-load')
        return result.returncode
    def test_safe_literal_config_accepted_without_bootstrap(self):self.assertEqual(self.run_config(),0)
    def test_production_database_and_user_refused(self):
        for changes in [{'DB_NAME':'wordpress'},{'DB_USER':'root'},{'DB_HOST':'mysql.example.invalid'},{'WP_ENVIRONMENT_TYPE':'production'},{'WP_HOME':'https://blog.example.invalid'},{'WP_HTTP_BLOCK_EXTERNAL':False},{'DUANAP_HUB_TEST_FIXTURE':False}]:
            self.assertNotEqual(self.run_config(changes),0)
    def test_duplicate_or_dynamic_definition_refused(self):
        self.assertNotEqual(self.run_config(suffix="define('DB_NAME','wordpress');"),0)
        self.run_config();file=self.root/'wp-config.php';text=file.read_text().replace('"hub_p2_audit_a12b34"','getenv("DATABASE_NAME")',1);file.write_text(text)
        result=subprocess.run([args.php,str(helper),str(self.root)],capture_output=True)
        self.assertNotEqual(result.returncode,0);self.assertFalse(self.marker.exists())
    def test_missing_or_modified_mail_http_guard_refused(self):
        guard=self.root/'wp-content/mu-plugins/000-duanap-test-isolation.php';guard.write_text('<?php // guard missing')
        self.assertNotEqual(self.run_config(),0);guard.unlink();self.assertNotEqual(self.run_config(),0)

if __name__=='__main__':unittest.main(argv=[__file__,*remaining])
