#!/usr/bin/env bash
set -euo pipefail

MC_ROOT="$(cd "$(dirname "$0")" && pwd)"
STACK_NAME="${STACK_NAME:-stacy-mc}"
PARAMS="${MC_ROOT}/cloudformation/parameters.json"
REGION="${AWS_REGION:-$(aws configure get region 2>/dev/null || echo us-east-1)}"

if [[ ! -f "${PARAMS}" ]]; then
  echo "Missing ${PARAMS} — copy parameters.example.json to parameters.json" >&2
  exit 1
fi

VPC="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text --region "${REGION}")"
SUBNET="$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC}" "Name=default-for-az,Values=true" --query 'Subnets[0].SubnetId' --output text --region "${REGION}")"

python3 - <<PY "${PARAMS}" "${VPC}" "${SUBNET}"
import json, sys
path, vpc, subnet = sys.argv[1:4]
params = json.load(open(path))
by_key = {p["ParameterKey"]: p for p in params}
for key, value in [("VpcId", vpc), ("SubnetId", subnet)]:
    if key not in by_key or by_key[key].get("ParameterValue") in ("", "REPLACE_ME"):
        if key in by_key:
            by_key[key]["ParameterValue"] = value
        else:
            params.append({"ParameterKey": key, "ParameterValue": value})
json.dump(params, open(path, "w"), indent=2)
print(f"Using VpcId={vpc} SubnetId={subnet}")
PY

python3 "${MC_ROOT}/pack.py" "${PARAMS}"

PARAM_OVERRIDES=()
while IFS= read -r line; do
  PARAM_OVERRIDES+=("$line")
done < <(python3 - <<PY "${PARAMS}"
import json, sys
CFN_KEYS = {
    "ProjectName", "InstanceType", "RootVolumeSizeGb", "EbsIops", "EbsThroughputMbps", "McPort",
    "AllowedCidrBlocks", "SshCidrBlocks", "KeyName", "AllocateEip",
    "SubnetId", "VpcId", "CreateBotIamUser", "EnableScheduledStart",
    "ScheduledStartCron", "ScheduledStartTimezone",
}
params = json.load(open(sys.argv[1]))
for p in params:
    if p["ParameterKey"] in CFN_KEYS:
        print(f"{p['ParameterKey']}={p['ParameterValue']}")
PY
)

echo "Validating packaged template..."
aws cloudformation validate-template \
  --template-body "file://${MC_ROOT}/cloudformation/packaged-template.yaml" \
  --region "${REGION}" >/dev/null

echo "Deploying stack ${STACK_NAME} in ${REGION}..."
aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${MC_ROOT}/cloudformation/packaged-template.yaml" \
  --parameter-overrides "${PARAM_OVERRIDES[@]}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${REGION}" \
  --no-fail-on-empty-changeset

echo ""
echo "Stack outputs:"
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query "Stacks[0].Outputs" \
  --output table

INSTANCE_ENV="${MC_ROOT}/instance.env"
env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY python3 - <<PY "${PARAMS}" "${INSTANCE_ENV}" "${STACK_NAME}" "${REGION}"
import json, subprocess, sys

params_path, env_path, stack, region = sys.argv[1:5]
params = {p["ParameterKey"]: p.get("ParameterValue", "") for p in json.load(open(params_path))}

def stack_out(key: str) -> str:
    return subprocess.check_output(
        [
            "aws", "cloudformation", "describe-stacks",
            "--stack-name", stack,
            "--region", region,
            "--query", f"Stacks[0].Outputs[?OutputKey=='{key}'].OutputValue | [0]",
            "--output", "text",
        ],
        text=True,
    ).strip()

instance_id = stack_out("InstanceId")
mc_host = params.get("ConnectHost") or stack_out("McHost")
mc_port = params.get("McPort") or stack_out("McPort") or "25565"
aws_region = params.get("AwsRegion") or stack_out("AwsRegion") or region

lines = [
    f"AWS_REGION={aws_region}",
    f"INSTANCE_ID={instance_id}",
    f"MC_HOST={mc_host}",
    f"MC_PORT={mc_port}",
    "",
]
open(env_path, "w").write("\n".join(lines))
print(f"Wrote {env_path} (MC_HOST={mc_host})")
PY
