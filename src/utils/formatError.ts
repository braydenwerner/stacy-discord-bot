export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const AWS_ENCODED_FAILURE =
  /\s*Encoded authorization failure message:\s*[A-Za-z0-9_-]+/gi;

function stripAwsNoise(message: string): string {
  return message
    .replace(AWS_ENCODED_FAILURE, "")
    .replace(/\s*User: arn:aws:iam::\d+:user\/\S+/gi, "")
    .replace(/\s*because no identity-based policy allows the \S+ action\.?/gi, ".")
    .replace(/\s+/g, " ")
    .trim();
}

function isAwsAccessDenied(message: string): boolean {
  return /not authorized|accessdenied|unauthorizedoperation|access denied/i.test(
    message,
  );
}

/** Short, user-safe message for Discord replies. Full errors stay in server logs. */
export function formatErrorForUser(error: unknown): string {
  const raw = formatError(error);

  if (/session|innertube|youtube|decipher|po.?token/i.test(raw)) {
    return "YouTube playback failed temporarily. Try again in a moment.";
  }

  if (isAwsAccessDenied(raw)) {
    if (/ec2:StartInstances/i.test(raw)) {
      return "I can't start the Minecraft server — the bot AWS account is missing EC2 start permission. An admin needs to update the stacy-mc-bot IAM policy.";
    }
    if (/ec2:StopInstances/i.test(raw)) {
      return "I can't stop the Minecraft server — the bot AWS account is missing EC2 stop permission. An admin needs to update the stacy-mc-bot IAM policy.";
    }
    if (/s3:ListBucket|s3:GetObject|s3:PutObject/i.test(raw)) {
      return "I can't access the Minecraft backup bucket — the bot AWS account is missing S3 permission.";
    }
    if (/cloudwatch:|ce:GetCost|budgets:/i.test(raw)) {
      return "I can't read AWS usage data — the bot AWS account is missing billing permission.";
    }
    if (/ssm:/i.test(raw)) {
      return "I can't run commands on the Minecraft server — the bot AWS account is missing SSM permission.";
    }
    return "That AWS operation isn't allowed for the bot account. Ask an admin to check IAM permissions.";
  }

  if (/arn:aws:/i.test(raw)) {
    return "Something went wrong talking to AWS. Try again in a moment, or ask an admin to check the bot logs.";
  }

  return stripAwsNoise(raw).slice(0, 500);
}
