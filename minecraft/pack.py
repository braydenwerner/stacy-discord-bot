#!/usr/bin/env python3
"""Render user-data and inject base64 UserData into the CloudFormation template."""
from __future__ import annotations

import base64
import json
import pathlib
import subprocess
import sys

MC_ROOT = pathlib.Path(__file__).resolve().parent
USER_DATA_TPL = MC_ROOT / "user-data.sh.tpl"
TEMPLATE_IN = MC_ROOT / "cloudformation" / "template.yaml"
TEMPLATE_OUT = MC_ROOT / "cloudformation" / "packaged-template.yaml"

SCRIPT_FILES = {
    "__BACKUP_SCRIPT__": MC_ROOT / "server/scripts/backup-world.sh",
    "__PERIODIC_BACKUP_SCRIPT__": MC_ROOT / "server/scripts/periodic-backup.sh",
    "__IDLE_SCRIPT__": MC_ROOT / "server/scripts/idle-shutdown.sh",
    "__STOP_SCRIPT__": MC_ROOT / "server/scripts/stop-server.sh",
    "__POST_STOP_SCRIPT__": MC_ROOT / "server/scripts/post-stop-backup.sh",
    "__INSTALL_SCRIPT__": MC_ROOT / "server/scripts/install-server.sh",
    "__APPLY_PAPER_TUNING_SCRIPT__": MC_ROOT / "server/scripts/apply-paper-tuning.sh",
    "__SYSTEMD_UNIT__": MC_ROOT / "server/systemd/minecraft.service",
    "__WHITELIST_JSON__": MC_ROOT / "server/whitelist.json",
}


def load_params(path: pathlib.Path) -> dict[str, str]:
    data = json.loads(path.read_text())
    return {item["ParameterKey"]: str(item.get("ParameterValue", "")) for item in data}


def main() -> None:
    params_path = (
        pathlib.Path(sys.argv[1])
        if len(sys.argv) > 1
        else MC_ROOT / "cloudformation/parameters.json"
    )
    if not params_path.is_file():
        print(f"Parameters file not found: {params_path}", file=sys.stderr)
        print(
            "Copy cloudformation/parameters.example.json to parameters.json and edit.",
            file=sys.stderr,
        )
        sys.exit(1)

    params = load_params(params_path)
    project = params.get("ProjectName", "stacy-mc")
    region = (
        params.get("AwsRegion")
        or subprocess.check_output(
            ["aws", "configure", "get", "region"], text=True
        ).strip()
        or "us-east-1"
    )

    account_id = subprocess.check_output(
        ["aws", "sts", "get-caller-identity", "--query", "Account", "--output", "text"],
        text=True,
    ).strip()

    replacements = {
        "__BACKUP_BUCKET__": f"{project}-data-backups-{region}-{account_id}",
        "__AWS_REGION__": region,
        "__MC_VERSION__": params.get("McVersion", "1.21.1"),
        "__JVM_MAX_MEMORY__": params.get("JvmMaxMemory", "6G"),
        "__MC_PORT__": params.get("McPort", "25565"),
        "__IDLE_SHUTDOWN_MINUTES__": params.get("IdleShutdownMinutes", "30"),
        "__BACKUP_INTERVAL_HOURS__": params.get("BackupIntervalHours", "6"),
        "__BACKUP_KEEP_COUNT__": params.get("BackupKeepCount", "30"),
    }

    content = USER_DATA_TPL.read_text()
    for key, value in replacements.items():
        content = content.replace(key, value)
    for key, script_path in SCRIPT_FILES.items():
        content = content.replace(key, script_path.read_text())

    icon_path = MC_ROOT / "server" / "server-icon.png"
    icon_b64 = (
        base64.b64encode(icon_path.read_bytes()).decode() if icon_path.is_file() else ""
    )
    content = content.replace("__SERVER_ICON_B64__", icon_b64)

    user_data_b64 = base64.b64encode(content.encode()).decode()
    template = TEMPLATE_IN.read_text()
    if "__USERDATA_BASE64__" not in template:
        print("template.yaml missing __USERDATA_BASE64__ placeholder", file=sys.stderr)
        sys.exit(1)

    TEMPLATE_OUT.write_text(template.replace("__USERDATA_BASE64__", user_data_b64))
    print(f"Wrote {TEMPLATE_OUT} (UserData {len(user_data_b64)} base64 chars)")


if __name__ == "__main__":
    main()
