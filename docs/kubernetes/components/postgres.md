# Postgres Component

Relative Location: kubernetes/components/postgres

## Key Parts

### Script: kubernetes/apps/database/postgres/Update.cs
This script will find any references to the postgres component, and generate the database, password and user.

The secret is created using the template defined at kubernetes/apps/database/postgres/app/user-template.yaml

The secret is available in both kubernetes and onepassword.

The name for the kubernetes secret is simply `[[database]]-postgres`
The name is for one password `${CLUSTER}-[[database]]-postgres`
