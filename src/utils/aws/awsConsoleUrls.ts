export function awsRegion(): string {
  return process.env.AWS_REGION ?? "us-east-1";
}

/** S3 object page in the AWS console. */
export function s3ObjectConsoleUrl(
  bucket: string,
  key: string,
  region = awsRegion(),
): string {
  const prefix = encodeURIComponent(key);
  return (
    `https://s3.console.aws.amazon.com/s3/object/${encodeURIComponent(bucket)}` +
    `?region=${encodeURIComponent(region)}&prefix=${prefix}`
  );
}

/** S3 bucket objects tab in the AWS console. */
export function s3BucketConsoleUrl(
  bucket: string,
  region = awsRegion(),
): string {
  return (
    `https://s3.console.aws.amazon.com/s3/buckets/${encodeURIComponent(bucket)}` +
    `?region=${encodeURIComponent(region)}&tab=objects`
  );
}

/** EC2 instance details in the AWS console. */
export function ec2InstanceConsoleUrl(
  instanceId: string,
  region = awsRegion(),
): string {
  return (
    `https://${encodeURIComponent(region)}.console.aws.amazon.com/ec2/home` +
    `?region=${encodeURIComponent(region)}` +
    `#InstanceDetails:instanceId=${encodeURIComponent(instanceId)}`
  );
}
