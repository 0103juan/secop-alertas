from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "email", "password"]
        extra_kwargs = {"email": {"required": True}}

    def validate_password(self, value):
        validate_password(value)  # the same validators as the admin: length, common passwords, similarity
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)  # hashes the password
