
Set up commands

``` text
mkdir mcp-qa-server

cd mcp-qa-server

npm init -y

npm install @modelcontextprotocol/server zod

npm install -D typescript tsx @types/node

npx tsc --init

edit the tsconfig file

update the package.json

npm run start -> to start the mcp server

then npx @modelcontextprotocol/inspector npx tsx src/index.ts

```