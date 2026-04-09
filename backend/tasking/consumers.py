import json

from channels.generic.websocket import AsyncWebsocketConsumer

from tasking.services import active_agents_snapshot, running_snapshot


class ActivityConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("activity", self.channel_name)
        await self.accept()
        await self.send(
            text_data=json.dumps(
                {
                    "type": "snapshot",
                    "running_tasks": running_snapshot(),
                    "active_agents": active_agents_snapshot(),
                }
            )
        )

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("activity", self.channel_name)

    async def activity_message(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "event",
                    "payload": event["payload"],
                    "running_tasks": running_snapshot(),
                    "active_agents": active_agents_snapshot(),
                }
            )
        )
