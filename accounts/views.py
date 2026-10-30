"""Sign-up and sessions for the browser client.

The web client keeps the access token in memory only (a page reload or a stolen localStorage cannot leak it) and the
refresh token in an HttpOnly cookie, which JavaScript cannot read. The cookie is SameSite=Strict and scoped to the
auth endpoints, so the browser only sends it on same-site requests to those paths: that is the CSRF defence.
Scripts and other API clients keep using /auth/token/, which returns both tokens in the body.
"""

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import generics, serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import RegisterSerializer

REFRESH_COOKIE = "alertas_refresh"
COOKIE_PATH = "/api/v1/auth/"


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"  # 10 an hour per address: open sign-up without a spam door


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Strict",
        path=COOKIE_PATH,
    )


class AccessSerializer(serializers.Serializer):
    access = serializers.CharField()


class LoginView(TokenObtainPairView):
    """POST username and password: the access token in the body, the refresh token in the cookie."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(responses=AccessSerializer)
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            _set_refresh_cookie(response, response.data.pop("refresh"))
        return response


class RefreshView(APIView):
    """POST with the cookie: a new access token. 204 without a cookie (no session is not an error: every anonymous
    page load asks), 401 when the cookie is expired or forged."""

    permission_classes = [AllowAny]  # the cookie is the credential here, not the Authorization header

    @extend_schema(request=None, responses={200: AccessSerializer, 204: None})
    def post(self, request):
        token = request.COOKIES.get(REFRESH_COOKIE)
        if not token:
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = TokenRefreshSerializer(data={"refresh": token})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as error:
            raise InvalidToken(error.args[0]) from error
        return Response({"access": serializer.validated_data["access"]})


class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH, samesite="Strict")
        return response


class MeSerializer(serializers.Serializer):
    username = serializers.CharField()
    email = serializers.EmailField()


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=MeSerializer)
    def get(self, request):
        return Response(MeSerializer(request.user).data)
