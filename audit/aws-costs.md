# AWS cost for The Long Boil's dev environment

Pulled from AWS Cost Explorer (unblended cost, USD) on 22 November 2026, covering 1 October to 22 November 2026. November 22 is a partial day.

## By month

| Service | October | November 1 to 22 |
| --- | ---: | ---: |
| RDS (Aurora, then RDS PostgreSQL) | 6.96 | 15.28 |
| Elastic Load Balancing | 3.87 | 11.60 |
| ECS on Fargate | 3.42 | 10.19 |
| VPC | 2.60 | 8.12 |
| Secrets Manager | 0.42 | 1.43 |
| KMS | 0.00 | 0.90 |
| Route 53 | 0.51 | 0.51 |
| Cost Explorer API | 0.10 | 0.24 |
| S3, ECR, DynamoDB, EC2 other | 0.27 | 0.26 |
| SageMaker (predates the game; not part of it) | 0.56 | 0.14 |
| Tax | 1.52 | 4.01 |
| **Total** | **20.23** | **52.69** |

## What the daily data shows

- **The stack went live on 24 October.** Before that the account cost about $0.02 a day, all of it from things that are not the game.
- **24 October to 8 November, about $3.00 a day.** Aurora was the largest line at about $1.50 a day.
- **8 November: Aurora replaced by an RDS PostgreSQL t4g.micro** (commit "Move dev's game server to RDS PostgreSQL and remove Aurora"). The database line fell from about $1.50 to $0.46 a day, a 69% cut, and the total fell to about $2.00 a day.
- **Steady state since 9 November, about $2.00 a day, or roughly $61 a month before tax:**

| Line | Per day | Share |
| --- | ---: | ---: |
| Application Load Balancer | 0.54 | 27% |
| ECS on Fargate (game server) | 0.47 | 24% |
| RDS PostgreSQL t4g.micro | 0.46 | 23% |
| VPC (most likely public IPv4 address charges; to confirm) | 0.36 to 0.48 | 18% |
| KMS and Secrets Manager | 0.13 | 7% |
| Cost Explorer, ECR, S3 | about 0.02 | 1% |

- **No Bedrock charges at all.** The GDD plans for agents to call Claude through Bedrock, but every agent run so far has gone through Claude Code on a Claude plan, so model cost does not appear in this bill.
- Route 53 is $0.50 per hosted zone per month, billed on the 1st.
