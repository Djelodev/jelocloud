import type { World } from "../engine";
import { writeFile } from "../engine/world";
import { check, commands, edit, host, scenario } from "./scenario";

const vpc = 'resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }';
const sg = `resource "aws_security_group" "web" {
  name = "jelo-web"
  ingress { from_port = 80 to_port = 80 protocol = "tcp" cidr_blocks = ["0.0.0.0/0"] }
  ingress { from_port = 22 to_port = 22 protocol = "tcp" cidr_blocks = ["172.16.238.2/32"] }
}`;
const ec2 = 'resource "aws_instance" "app" { ami = "ami-0123456789abcdef0" instance_type = "t2.micro" }';
const policy = `resource "aws_iam_policy" "ec2_read" {
  name = "ec2-read"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["ec2:Describe*"], Resource = "*" }]
  })
}`;
const privateEc2 = `${vpc}
resource "aws_subnet" "private" {
  vpc_id = aws_vpc.main.id
  cidr_block = "10.0.1.0/24"
  map_public_ip_on_launch = false
}
resource "aws_instance" "app" {
  ami = "ami-0123456789abcdef0"
  instance_type = "t2.micro"
  subnet_id = aws_subnet.private.id
  associate_public_ip_address = false
}`;
const dynamo = `resource "aws_dynamodb_table" "items" {
  name = "jelo-items"
  billing_mode = "PAY_PER_REQUEST"
  hash_key = "id"
  attribute { name = "id" type = "S" }
}
resource "aws_iam_role" "app" {
  name = "jelo-app"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_policy" "dynamo" {
  name = "jelo-dynamo"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem"], Resource = aws_dynamodb_table.items.arn }]
  })
}
resource "aws_iam_role_policy_attachment" "app" {
  role = aws_iam_role.app.name
  policy_arn = aws_iam_policy.dynamo.arn
}`;
const alarm = `resource "aws_sns_topic" "alerts" { name = "jelo-alerts" }
resource "aws_cloudwatch_metric_alarm" "cpu" {
  alarm_name = "ec2-cpu-high"
  namespace = "AWS/EC2"
  metric_name = "CPUUtilization"
  comparison_operator = "GreaterThanThreshold"
  threshold = 80
  evaluation_periods = 2
  statistic = "Average"
  period = 60
  alarm_actions = [aws_sns_topic.alerts.arn]
}
output "alarm_name" { value = aws_cloudwatch_metric_alarm.cpu.alarm_name }`;
const lookup = (w: World, address: string, key: string) => w.aws.resources[address]?.attrs[key];
export function terraform(day: number) {
  const lab = (content: string, label: string, test: (w: World) => boolean) =>
    scenario([edit("main.tf", content + "\n"), ...commands("terraform init", "terraform validate", "terraform plan", "terraform apply -auto-approve",
      day === 100 ? "terraform output" : "terraform state list")], [check(label, test)], (w) => {
      writeFile(host(w), "/usr/local/bin/terraform", "terraform", "root", 0o755);
    });
  switch (day) {
    case 94: return lab(vpc, "Le VPC possède le CIDR 10.0.0.0/16", (w) =>
      lookup(w, "aws_vpc.main", "cidr_block") === "10.0.0.0/16");
    case 95: return lab(sg, "Le Security Group autorise HTTP et limite SSH au jump host", (w) => {
      const ingress = lookup(w, "aws_security_group.web", "ingress");
      return Array.isArray(ingress) && ingress.length === 2 && [22, 80].every((port) => ingress.some((r) =>
        r.from_port === port && r.to_port === port && r.protocol === "tcp" &&
        r.cidr_blocks?.join() === (port === 22 ? "172.16.238.2/32" : "0.0.0.0/0")));
    });
    case 96: return lab(ec2, "Une instance EC2 t2.micro existe dans l’état simulé", (w) =>
      lookup(w, "aws_instance.app", "instance_type") === "t2.micro");
    case 97: return lab(policy, "La policy permet uniquement les opérations EC2 Describe", (w) => {
      try {
        const statement = JSON.parse(String(lookup(w, "aws_iam_policy.ec2_read", "policy"))).Statement;
        return statement.length === 1 && statement[0].Effect === "Allow" && statement[0].Action?.join() === "ec2:Describe*";
      } catch { return false; }
    });
    case 98: return lab(privateEc2, "L’instance sans IP publique est dans un subnet privé du VPC", (w) =>
      !!w.aws.resources["aws_vpc.main"] && !!w.aws.resources["aws_subnet.private"] &&
      lookup(w, "aws_subnet.private", "vpc_id") === w.aws.resources["aws_vpc.main"].id &&
      lookup(w, "aws_subnet.private", "map_public_ip_on_launch") === false &&
      lookup(w, "aws_instance.app", "subnet_id") === w.aws.resources["aws_subnet.private"].id &&
      lookup(w, "aws_instance.app", "associate_public_ip_address") === false);
    case 99: return lab(dynamo, "Le rôle reçoit une policy limitée à la table DynamoDB du lab", (w) =>
      lookup(w, "aws_iam_role_policy_attachment.app", "role") === "jelo-app" &&
      String(lookup(w, "aws_iam_role_policy_attachment.app", "policy_arn")).endsWith("/jelo-dynamo") &&
      String(lookup(w, "aws_iam_policy.dynamo", "policy")).includes("/jelo-items") &&
      lookup(w, "aws_dynamodb_table.items", "hash_key") === "id");
    case 100: return lab(alarm, "CloudWatch alerte SNS lorsque CPUUtilization dépasse 80 %", (w) => {
      const address = "aws_cloudwatch_metric_alarm.cpu";
      return lookup(w, address, "threshold") === 80 && lookup(w, address, "metric_name") === "CPUUtilization" &&
        lookup(w, address, "comparison_operator") === "GreaterThanThreshold" &&
        lookup(w, "aws_sns_topic.alerts", "name") === "jelo-alerts" &&
        String(lookup(w, address, "alarm_actions")).endsWith("/jelo-alerts");
    });
    default: throw new Error("Jour Terraform inconnu");
  }
}
