from __future__ import annotations

import contextlib
from dataclasses import dataclass
from typing import Iterable

from fastapi import FastAPI
from mcp.server import MCPServer

APP_NAME = "Universal AI Tool Hub — ChatGPT Public Surface"
VERSION = "0.1.0-prep"


@dataclass(frozen=True)
class Workflow:
    id: str
    title: str
    description: str
    keywords: tuple[str, ...]


WORKFLOWS: tuple[Workflow, ...] = (
    Workflow(
        id="discover-tools",
        title="Discover Hub capabilities",
        description="Find the safest Hub capability for a user goal without executing external actions.",
        keywords=("discover", "find", "search", "tool", "capability", "workflow"),
    ),
    Workflow(
        id="plan-workflow",
        title="Plan a Hub workflow",
        description="Turn a plain-language goal into a small, reviewable sequence of Hub steps.",
        keywords=("plan", "workflow", "steps", "goal", "task"),
    ),
    Workflow(
        id="check-readiness",
        title="Check connection readiness",
        description="Explain what a connection needs before a Hub workflow can be run, without returning credentials.",
        keywords=("ready", "readiness", "connection", "oauth", "permission", "setup"),
    ),
)


def _public_workflow(w: Workflow) -> dict[str, str]:
    return {"id": w.id, "title": w.title, "description": w.description}


def _rank(query: str, rows: Iterable[Workflow]) -> list[Workflow]:
    tokens = {token for token in (query or "").lower().split() if token}
    scored: list[tuple[int, Workflow]] = []
    for row in rows:
        haystack = " ".join((row.id, row.title, row.description, *row.keywords)).lower()
        score = sum(1 for token in tokens if token in haystack)
        scored.append((score, row))
    scored.sort(key=lambda item: (-item[0], item[1].id))
    return [row for score, row in scored if score > 0] if tokens else [row for _, row in scored]


mcp = MCPServer(
    APP_NAME,
    version=VERSION,
    instructions=(
        "This is the narrow ChatGPT-facing surface of Universal AI Tool Hub. "
        "It exposes only explicit, read-only Hub-owned workflow discovery and planning tools. "
        "It never returns credentials and never relays arbitrary third-party actions."
    ),
)


@mcp.tool(
    description="List the explicit Hub-owned workflows that are safe to expose to ChatGPT.",
    annotations={"readOnlyHint": True, "openWorldHint": False, "destructiveHint": False},
)
def list_supported_workflows() -> dict:
    return {"workflows": [_public_workflow(w) for w in WORKFLOWS]}


@mcp.tool(
    description="Find the most relevant supported Hub workflow for a plain-language goal. No external action is executed.",
    annotations={"readOnlyHint": True, "openWorldHint": False, "destructiveHint": False},
)
def find_workflow(query: str, limit: int = 5) -> dict:
    rows = _rank(query, WORKFLOWS)[: max(1, min(limit, 10))]
    return {"query": query, "matches": [_public_workflow(w) for w in rows]}


@mcp.tool(
    description="Explain one supported Hub workflow, including its side-effect boundary. No external action is executed.",
    annotations={"readOnlyHint": True, "openWorldHint": False, "destructiveHint": False},
)
def explain_workflow(workflow_id: str) -> dict:
    row = next((w for w in WORKFLOWS if w.id == workflow_id), None)
    if row is None:
        return {"status": "not_found", "workflow_id": workflow_id}
    return {
        "status": "ok",
        "workflow": _public_workflow(row),
        "side_effects": "none",
        "credentials_returned": False,
        "external_action_executed": False,
    }


@mcp.tool(
    description="Create a small reviewable plan for using the Hub. The result is advisory only and executes nothing.",
    annotations={"readOnlyHint": True, "openWorldHint": False, "destructiveHint": False},
)
def plan_workflow(goal: str) -> dict:
    matches = _rank(goal, WORKFLOWS)
    selected = matches[0] if matches else WORKFLOWS[0]
    return {
        "goal": goal,
        "recommended_workflow": _public_workflow(selected),
        "steps": [
            "Confirm the requested outcome and required service.",
            "Check whether the needed connection and permission are available.",
            "Show the exact action before any future write-capable tool is allowed to run.",
        ],
        "status": "advisory_only",
        "external_action_executed": False,
    }


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    async with mcp.session_manager.run():
        yield


app = FastAPI(title=APP_NAME, version=VERSION, lifespan=lifespan)
app.mount(
    "/mcp",
    mcp.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
    ),
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": APP_NAME, "version": VERSION, "tool_count": 4}
