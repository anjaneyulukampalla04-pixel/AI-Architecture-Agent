
         variable "aws_region" {
            type        = string
            default     = "us-east-1"
            description = "The AWS region to deploy to"
         }

         variable "ecs_task_cpu" {
            type        = number
            default     = 1024
            description = "The CPU to allocate to the ECS task"
         }

         variable "ecs_task_memory" {
            type        = number
            default     = 2048
            description = "The memory to allocate to the ECS task"
         }

         variable "rds_instance_class" {
            type        = string
            default     = "db.t3.micro"
            description = "The instance class to use for the RDS instance"
         }

         variable "rds_allocated_storage" {
            type        = number
            default     = 20
            description = "The amount of storage to allocate to the RDS instance"
         }

         variable "sqs_queue_name" {
            type        = string
            default     = "comp-004-queue"
            description = "The name of the SQS queue"
         }

         variable "alb_name" {
            type        = string
            default     = "comp-005-alb"
            description = "The name of the Application Load Balancer"
         }
      