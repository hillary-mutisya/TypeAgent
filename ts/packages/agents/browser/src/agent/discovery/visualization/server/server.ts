            // If this is the first node and label is empty, use "Start"
            const nodeLabel =
                isFirstNode && !currentState ? "Start" : currentState || "";

            // Create a new node with the screenshot if provided
            const newNode: PlanNode = {
                id: sourceNodeId,
                label: nodeLabel,
                type: isFirstNode ? "start" : nodeType,
                isTemporary: false,
            };

            // Apply screenshot if provided
            if (screenshot) {
                newNode.screenshot = screenshot;
            }

            dynamicPlanData.nodes.push(newNode);
        }
    }

    // Create a new temporary node with blank label
    targetNodeId = `node-${dynamicPlanData.nodes.length}`;

    // Create temporary node
    const newTempNode: PlanNode = {
        id: targetNodeId,
        label: "", // Blank label for temporary nodes
        type: "temporary",
        isTemporary: true,
    };

    // We don't apply screenshot to the temporary node in this case,
    // as we want it on the source node that we just confirmed

    dynamicPlanData.nodes.push(newTempNode);

    // Create the link with the action name
    dynamicPlanData.links.push({
        source: sourceNodeId,
        target: targetNodeId,
        label: action,
    });

    // Update current node
    dynamicPlanData.currentNode = targetNodeId;

    broadcastUpdate("transition", dynamicPlanData);
    res.json(dynamicPlanData);
});

// API endpoint to set the plan title
app.post("/api/title", (req: Request, res: Response) => {
    const { title } = req.body as TitleRequest;
    const mode = req.query.mode || "dynamic";

    if (!title) {
        return res.status(400).json({ error: "Title is required" });
    }

    if (mode === "static") {
        staticPlanData.title = title;
        broadcastUpdate("title", staticPlanData);
        res.json(staticPlanData);
    } else {
        dynamicPlanData.title = title;
        broadcastUpdate("title", dynamicPlanData);
        res.json(dynamicPlanData);
    }
});

// API endpoint to set a screenshot for a node
app.post("/api/screenshot", (req: Request, res: Response) => {
    const { nodeId, screenshot } = req.body as ScreenshotRequest;

    if (!nodeId || !screenshot) {
        return res
            .status(400)
            .json({ error: "Node ID and screenshot are required" });
    }

    // Find the node in both dynamic and static plan data
    const dynamicNode = dynamicPlanData.nodes.find(
        (node: PlanNode) => node.id === nodeId,
    );
    const staticNode = staticPlanData.nodes.find(
        (node: PlanNode) => node.id === nodeId,
    );

    // Update the node if found
    if (dynamicNode) {
        dynamicNode.screenshot = screenshot;
        broadcastUpdate("node-update", dynamicPlanData);
    }

    if (staticNode) {
        staticNode.screenshot = screenshot;
        broadcastUpdate("node-update", staticPlanData);
    }

    if (!dynamicNode && !staticNode) {
        return res.status(404).json({ error: "Node not found" });
    }

    // Return the updated plan data
    const currentPlanData = dynamicNode ? dynamicPlanData : staticPlanData;
    res.json(currentPlanData);
});

app.post("/api/reset", (req: Request, res: Response) => {
    const preserveTitle = req.query.preserveTitle === "true";
    const currentTitle = dynamicPlanData.title;

    dynamicPlanData = {
        nodes: [],
        links: [],
        currentNode: null,
        title: preserveTitle ? currentTitle : "Dynamic Plan",
    };

    broadcastUpdate("reset", dynamicPlanData);

    res.json(dynamicPlanData);
});

process.send?.("Success");

process.on("message", (message: any) => {});

process.on("disconnect", () => {
    process.exit(1);
});

app.listen(port, () => {
    debug(`Web Plan Visualizer server running at http://localhost:${port}`);
});