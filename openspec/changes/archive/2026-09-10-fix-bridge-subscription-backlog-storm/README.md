# fix-bridge-subscription-backlog-storm

Stop the bridge from tearing down/rebuilding its herdr event subscription on every pane/tab/workspace change; the resulting resubscribe storm forces old herdr builds to replay their full event backlog to every subscribed client, showing hours-old phantom lifecycle events
