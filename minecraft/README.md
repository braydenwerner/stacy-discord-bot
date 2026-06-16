# Minecraft on AWS

Pay-only-when-used Paper server on EC2. Stacy starts/stops it via `/minecraft`; backups and lifecycle events post to the configured Discord channel.

```
minecraft/
  deploy.sh                  # Pack user-data + deploy CloudFormation stack
  pack.py                    # Embed server/ scripts into the template
  user-data.sh.tpl           # EC2 first-boot template
  cloudformation/
    template.yaml            # AWS stack
    parameters.example.json  # Copy → parameters.json
  server/                    # Installed on the EC2 host (not the Pi)
    scripts/
    systemd/
```

## Deploy

```bash
cd minecraft
cp cloudformation/parameters.example.json cloudformation/parameters.json
# edit parameters.json

chmod +x deploy.sh
./deploy.sh
```

After deploy, set Pi `.env` from stack outputs (`InstanceId`, `BackupBucket`, bot IAM keys) and `ConnectHost` in `parameters.json` for the player hostname (`mc.motelrate.com`). `./deploy.sh` writes `instance.env` automatically. See main [README](../README.md) for Stacy env vars.

## Parameters

`cloudformation/parameters.json` holds CloudFormation stack params plus user-data-only keys (`McVersion`, `JvmMaxMemory`, `IdleShutdownMinutes`, `BackupIntervalHours`, `BackupKeepCount`, `ConnectHost`, `AwsRegion`). `EnableScheduledStart` defaults to **`false`**. Set **`ConnectHost`** to your DNS name (e.g. `mc.motelrate.com` → Elastic IP A record).

## Server automation

- **systemd** — Paper with Aikar JVM flags
- **cron** every 5 min — idle shutdown after 30 min with no players (writes `events/idle-shutdown-*.json` to S3 for Discord alerts)
- **cron** every `BackupIntervalHours` (default 6) — S3 world backup while running (`BACKUP_SOURCE=periodic`, keys like `data-20260605T180006Z.tar.gz` at the bucket root)

Stacy polls S3 every 2 minutes for new backups and idle-shutdown events, and EC2 state every 2 minutes. Messages go to `MINECRAFT_NOTIFY_CHANNEL_ID` on the Pi.

**Observability** (via `/minecraft` or `manageMinecraft`): `health`, `logs`, `backups`, `metrics`. Metrics use CloudWatch (CPU, EBS IOPS/throughput, network) plus SSM for load/memory/disk on the instance. Redeploy the CloudFormation stack (or update the bot IAM user) for `cloudwatch:GetMetricData`, `ec2:DescribeVolumes`, and SSM permissions.

If `/minecraft start` fails with an IAM access error, the bot user policy may still reference an old instance ID. Redeploy the stack **or** run (with **admin** AWS credentials, not the bot user):

```bash
pnpm run minecraft:update-bot-iam
```

That applies a tag-based policy (`Project=stacy-mc`) so start/stop works after instance replacement.

Edit `server/` scripts, then re-run `./deploy.sh`.

## Destroy

```bash
aws cloudformation delete-stack --stack-name stacy-mc
```

Back up the S3 bucket first if you want to keep world archives.
