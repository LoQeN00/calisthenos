Mounting volume on: /var/lib/containers/railwayapp/bind-mounts/0ba48aca-39f6-4705-a128-22fe68727b5d/vol_egj8j6ej58dy60q0
Starting Container
Reading config file '/app/drizzle.config.ts'

> db:migrate
> drizzle-kit migrate
> No config path provided, using default 'drizzle.config.ts'
> Using 'postgres' driver for database querying
> routine: 'transformCreateStmt'
> severity_local: 'NOTICE',
> }
> [⣷] applying migrations...{
> severity: 'NOTICE',
> severity_local: 'NOTICE',
> code: '42P06',
> message: 'schema "drizzle" already exists, skipping',
> severity: 'NOTICE',
> file: 'schemacmds.c',
> line: '132',
> code: '42P07',
> routine: 'CreateSchemaCommand'
> message: 'relation "\_\_drizzle_migrations" already exists, skipping',
> }
> file: 'parse_utilcmd.c',
> {
> line: '208',
> [✓] migrations applied successfully!npm notice
> npm notice New major version of npm available! 10.9.8 -> 11.15.0
> npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.15.0
> npm notice To update run: npm install -g npm@11.15.0
> npm notice
