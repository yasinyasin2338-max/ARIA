import os
import pwd
import grp
from pathlib import Path

DATA_DIR = Path(os.environ.get("UTH_DATA_DIR", "/app/data"))
USER = os.environ.get("UTH_RUNTIME_USER", "hub")


def _chown_tree(path: Path, uid: int, gid: int) -> None:
    path.mkdir(parents=True, exist_ok=True)
    os.chown(path, uid, gid)
    for root, dirs, files in os.walk(path):
        for name in dirs:
            try:
                os.chown(os.path.join(root, name), uid, gid)
            except FileNotFoundError:
                pass
        for name in files:
            try:
                os.chown(os.path.join(root, name), uid, gid)
            except FileNotFoundError:
                pass


def main() -> None:
    if os.geteuid() == 0:
        pw = pwd.getpwnam(USER)
        uid, gid = pw.pw_uid, pw.pw_gid
        _chown_tree(DATA_DIR, uid, gid)
        os.setgroups([])
        os.setgid(gid)
        os.setuid(uid)

    port = os.environ.get("PORT", "8000")
    os.execvp(
        "uvicorn",
        [
            "uvicorn",
            "connector_entry:app",
            "--host",
            "0.0.0.0",
            "--port",
            port,
        ],
    )


if __name__ == "__main__":
    main()
