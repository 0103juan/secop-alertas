from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import generics, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from contracts.api import ContractSerializer
from contracts.models import Contract

from . import rules
from .models import Alert, Channel, Subscription
from .notifiers import DeliveryError, ensure_public_https

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "email", "password"]
        extra_kwargs = {"email": {"required": True}}

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, data):
        return User.objects.create_user(**data)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ["id", "name", "rules", "channel", "target", "active", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate_rules(self, value):
        try:
            rules.build(value)
        except rules.RuleError as error:
            raise serializers.ValidationError(str(error)) from None
        return value

    def validate(self, data):
        channel = data.get("channel", getattr(self.instance, "channel", Channel.EMAIL))
        target = data.get("target", getattr(self.instance, "target", ""))
        if channel == Channel.EMAIL:
            serializers.EmailField().run_validation(target)
        else:
            try:
                ensure_public_https(target)
            except DeliveryError as error:
                raise serializers.ValidationError({"target": str(error)}) from None
        return data


class SubscriptionSecretSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ["id", "secret"]


class AlertSerializer(serializers.ModelSerializer):
    contract = ContractSerializer()

    class Meta:
        model = Alert
        fields = ["id", "contract", "created_at", "delivered_at", "attempts"]


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
        """The 20 most recent contracts these rules would have matched, computed in the database."""
        rule = rules.build(self.get_object().rules)
        contracts = Contract.objects.filter(rule.as_q()).order_by("-signed_on")[:20]
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
