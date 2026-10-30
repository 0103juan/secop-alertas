from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from contracts.models import Contract
from contracts.serializers import ContractSerializer

from . import rules
from .models import Alert, Subscription
from .serializers import AlertSerializer, SubscriptionSecretSerializer, SubscriptionSerializer

PREVIEW_SIZE = 20


class NewestFirst(CursorPagination):
    ordering = "-created_at"


class SubscriptionViewSet(viewsets.ModelViewSet):
    """A user's own subscriptions. The queryset is filtered by owner, so another user's id answers 404, not 403:
    the API does not reveal which ids exist."""

    serializer_class = SubscriptionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = NewestFirst

    def get_queryset(self):
        return Subscription.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """The most recent contracts these rules would have matched, computed in the database."""
        rule = rules.build(self.get_object().rules)
        contracts = Contract.objects.filter(rule.as_q()).order_by("-signed_on", "id")[:PREVIEW_SIZE]
        return Response(ContractSerializer(contracts, many=True).data)

    @action(detail=True, methods=["get"])
    def secret(self, request, pk=None):
        """The key that signs this subscription's webhooks, shown only to its owner."""
        return Response(SubscriptionSecretSerializer(self.get_object()).data)


class AlertViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = AlertSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = NewestFirst
    filterset_fields = ["subscription"]

    def get_queryset(self):
        return Alert.objects.filter(subscription__owner=self.request.user).select_related("contract")
