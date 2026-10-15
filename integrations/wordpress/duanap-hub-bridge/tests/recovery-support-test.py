"""Filesystem barriers for the isolated recovery drill; no database required."""
import hashlib, importlib.util, json, pathlib, tempfile, unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('recovery_support',pathlib.Path(__file__).with_name('recovery-support.py'))
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)

class RecoveryBarriers(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        self.base=pathlib.Path(self.temporary.name);self.root=self.base/'wordpress';self.root.mkdir()
        for name,text in [('duanap-hub-fixture.marker','isolated'),('wp-load.php','<?php'),('wp-config.php','<?php')]:
            (self.root/name).write_text(text)
    def test_unmarked_root_refused(self):
        (self.root/'duanap-hub-fixture.marker').unlink()
        with self.assertRaises(ValueError):support.fixture_root(self.root)
    def test_symlink_root_and_nested_file_refused(self):
        link=self.base/'alias';link.symlink_to(self.root,target_is_directory=True)
        with self.assertRaises(ValueError):support.fixture_root(link)
        (self.root/'linked-secret.php').symlink_to(self.base/'unrelated')
        with self.assertRaises(ValueError):support.fixture_root(self.root)
    def test_new_target_must_be_sibling_and_never_overwrite(self):
        with self.assertRaises(ValueError):support.new_target(self.root,self.root)
        with self.assertRaises(ValueError):support.new_target(self.root,self.base/'elsewhere'/'wordpress')
        self.assertEqual(support.new_target(self.root,self.base/'restore-001'),self.base/'restore-001')
    def test_database_must_be_generated_isolated_schema(self):
        self.assertEqual(support.fixture_database('hub_p2_audit_a12b34'),'hub_p2_audit_a12b34')
        for value in ['wordpress','hub_p2_audit_','hub_p2_audit_x;DROP DATABASE wordpress','hub_p2_audit_../x']:
            with self.assertRaises(ValueError):support.fixture_database(value)
    def test_valid_archive_verified_and_tamper_refused(self):
        backup=self.base/'archive';backup.mkdir();(backup/'database.sql').write_bytes(b'synthetic dump')
        manifest={'database.sql':hashlib.sha256(b'synthetic dump').hexdigest()}
        support.verify_artifacts(backup,manifest)
        (backup/'database.sql').write_bytes(b'tampered')
        with self.assertRaises(ValueError):support.verify_artifacts(backup,manifest)
    def test_artifact_traversal_and_symlink_refused(self):
        backup=self.base/'archive';backup.mkdir();(self.base/'outside').write_bytes(b'outside')
        digest=hashlib.sha256(b'outside').hexdigest()
        with self.assertRaises(ValueError):support.verify_artifacts(backup,{'../outside':digest})
        (backup/'database.sql').symlink_to(self.base/'outside')
        with self.assertRaises(ValueError):support.verify_artifacts(backup,{'database.sql':digest})
    def test_symlinked_artifact_directory_is_refused_even_inside_archive(self):
        backup=self.base/'archive';backup.mkdir();(backup/'database.sql').write_bytes(b'dump')
        actual=backup/'actual';actual.mkdir();(actual/'media').write_bytes(b'media')
        (backup/'alias').symlink_to(actual,target_is_directory=True)
        manifest={'database.sql':hashlib.sha256(b'dump').hexdigest(),'alias/media':hashlib.sha256(b'media').hexdigest()}
        with self.assertRaises(ValueError):support.verify_artifacts(backup,manifest)
    def test_both_fixture_services_and_listening_port_block_mutation(self):
        for active in ['duanap-p2-audit.service','duanap-p2-wpopt-audit.service']:
            def status(argv,**kwargs):return type('Status',(),{'returncode':0 if argv[-1]==active else 3})()
            with patch.object(support.subprocess,'run',side_effect=status):
                with self.assertRaises(ValueError):support.assert_offline()
        with patch.object(support.subprocess,'run',return_value=type('Status',(),{'returncode':3})()),patch.object(support.socket,'create_connection'):
            with self.assertRaises(ValueError):support.assert_offline()
    def test_plugin_source_symlink_is_refused(self):
        plugin=self.base/'plugin';plugin.mkdir();(plugin/'index.php').write_text('<?php')
        (plugin/'nested').symlink_to(self.root,target_is_directory=True)
        with self.assertRaises(ValueError):support.plugin_source(plugin,'index.php')

if __name__=='__main__':unittest.main()
