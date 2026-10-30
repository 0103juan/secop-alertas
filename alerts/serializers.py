from rest_framework import serializers

from contracts.serializers import ContractSerializer

from . import rules
from .models import Alert, Channel, Subscription
from .notifiers import DeliveryError, ensure_public_https


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ["id", "name", "rules", "channel", "target", "active", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate_rules(self, value):
        # The same factory the matcher uses, so what the API accepts is exactly what the matcher can run.
        try:
            rules.build(value)
        except rules.RuleError as error:
            raise serializers.ValidationError(str(error)) from None
        return value

    def validate(self, data):
        # On PATCH only one of the two may come; validate the pair as it will be stored.
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
        fields = ["id", "subscription", "contract", "created_at", "delivered_at", "attempts"]
