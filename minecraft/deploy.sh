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
    "ProjectName", "InstanceType", "RootVolumeSizeGb", "McPort",
    "AllowedCidrBlocks", "SshCidrBlocks", "KeyName", "AllocateEip",
    "SubnetId", "VpcId", "CreateBotIamUser", "EnableScheduledStart",
    "ScheduledStartCron", "ScheduledStartTimezone", "BackupRetentionDays",
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
