# Events

Tags: events

## 404 on Empty

* Start server from "database/basic"
* Request file "/api/events.json"
* Response status is "404"

## Append first event

* Start server from "database/basic"
* Append tag event with "hello" for media "96419bb03fb2a041ff265e27cfccc4be8b04346d"
* Request file "/api/events.json"
* Response status is "200"

## Post first event

* Start server from "database/basic"
* Post tag event with "hello" for media "96419bb03fb2a041ff265e27cfccc4be8b04346d"
* Request file "/api/events.json"
* Response status is "200"

___
* Stop server
* Stderr is empty