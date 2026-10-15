"""Safety checks shared by the synthetic, offline recovery acceptance test."""
import hashlib, pathlib, re, socket, subprocess

def assert_offline():
    for unit in ['duanap-p2-audit.service','duanap-p2-wpopt-audit.service']:
        result=subprocess.run(['systemctl','is-active','--quiet',unit],capture_output=True)
        if result.returncode not in [3,4]:raise ValueError('Stop fixture HTTP before changes; unknown service state is refused')
    try:connection=socket.create_connection(('127.0.0.1',1030),timeout=1)
    except ConnectionRefusedError:return
    except OSError as error:raise ValueError('Cannot verify fixture port is offline') from error
    else:connection.close();raise ValueError('Fixture port is still listening')

def plugin_source(value,entry):
    root=pathlib.Path(value).absolute()
    if root.resolve()!=root or not root.is_dir() or any(path.is_symlink() for path in root.rglob('*')):raise ValueError('Real plugin code without nested symlinks required')
    if not (root/entry).is_file():raise ValueError('Expected plugin entry required')
    return root

def preflight(root,php):
    result=subprocess.run([php,str(pathlib.Path(__file__).with_name('fixture-bootstrap.php')),str(root)],capture_output=True)
    if result.returncode!=0:raise ValueError('Unsafe fixture configuration refused before WordPress bootstrap')

def fixture_root(value):
    root=pathlib.Path(value).absolute()
    if root.resolve()!=root or not root.is_dir():raise ValueError('Real fixture directory required')
    if any(path.is_symlink() for path in root.rglob('*')):raise ValueError('Symlinks are not accepted')
    if not (root/'duanap-hub-fixture.marker').is_file() or (root/'duanap-hub-fixture.marker').read_text().strip()!='isolated':raise ValueError('Isolated fixture marker required')
    if not all((root/name).is_file() for name in ['wp-load.php','wp-config.php']):raise ValueError('WordPress fixture files required')
    return root

def new_target(source,value):
    source=pathlib.Path(source).absolute();target=pathlib.Path(value).absolute()
    if target.resolve()!=target or target.parent!=source.parent or target.exists() or target.is_symlink():raise ValueError('A new sibling restore directory is required')
    return target

def fixture_database(value):
    if not isinstance(value,str) or not re.fullmatch(r'hub_p2_audit_[a-f0-9]{6,24}',value):raise ValueError('Synthetic database name required')
    return value

def verify_artifacts(folder,manifest):
    folder=pathlib.Path(folder).absolute()
    if folder.resolve()!=folder or not folder.is_dir() or not isinstance(manifest,dict) or 'database.sql' not in manifest:raise ValueError('Private archive and full manifest required')
    for name,digest in manifest.items():
        relative=pathlib.PurePosixPath(name)
        if relative.is_absolute() or '..' in relative.parts or '\\' in name:raise ValueError('Unsafe artifact path')
        target=folder.joinpath(*relative.parts)
        if any(parent.is_symlink() for parent in [target,*target.parents] if parent.is_relative_to(folder)):raise ValueError('Symlinked artifact components refused')
        if not target.resolve().is_relative_to(folder) or target.is_symlink() or not target.is_file():raise ValueError('Unsafe artifact file')
        if not re.fullmatch('[a-f0-9]{64}',digest) or hashlib.sha256(target.read_bytes()).hexdigest()!=digest:raise ValueError('Backup integrity mismatch')
