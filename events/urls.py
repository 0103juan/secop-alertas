from django.urls import path

from .push import pubsub_push

urlpatterns = [path("internal/events/pubsub", pubsub_push, name="pubsub-push")]
