# Server Prefix

Tags: server,prefix

* Init dir from "database/basic"
* Create database

## Enable prefix

* Start server with args "--prefix gallery"
* Wait for file "/gallery/api/database.json"
* Request file "/gallery/favicon.ico"
* Response status is "200"

## Redirect to prefix

* Start server with args "--prefix gallery"
* Request file "/"
* Response status is "302"
___
* Stop server
