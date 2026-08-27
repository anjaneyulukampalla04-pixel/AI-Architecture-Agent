
         output "ecs_cluster_name" {
            value       = aws_ecs_cluster.main.name
            description = "The name of the ECS cluster"
         }

         output "ecs_service_name" {
            value       = aws_ecs_service.comp_001.name
            description = "The name of the ECS service"
         }

         output "rds_instance_endpoint" {
            value       = aws_db_instance.comp_003.endpoint
            description = "The endpoint of the RDS instance"
         }

         output "sqs_queue_url" {
            value       = aws_sqs_queue.comp_004.id
            description = "The URL of the SQS queue"
         }

         output "alb_dns_name" {
            value       = aws_alb.comp_005.dns_name
            description = "The DNS name of the Application Load Balancer"
         }
      