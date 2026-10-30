"""The browser session: access token in the body, refresh token only in an HttpOnly cookie."""

from accounts.views import COOKIE_PATH, REFRESH_COOKIE

LOGIN = "/api/v1/auth/login/"
REFRESH = "/api/v1/auth/refresh/"


def test_login_puts_the_refresh_token_in_a_strict_httponly_cookie_only(api, user):
    response = api.post(LOGIN, {"username": "ana", "password": "una-clave-larga-123"})
    assert response.status_code == 200
    assert set(response.json()) == {"access"}  # never in the body, where JavaScript could read it
    cookie = response.cookies[REFRESH_COOKIE]
    assert cookie["httponly"] and cookie["samesite"] == "Strict" and cookie["path"] == COOKIE_PATH


def test_the_cookie_refreshes_the_access_token_and_the_token_reads_me(api, user):
    api.post(LOGIN, {"username": "ana", "password": "una-clave-larga-123"})
    access = api.post(REFRESH).json()["access"]
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    assert api.get("/api/v1/auth/me/").json() == {"username": "ana", "email": "ana@example.com"}


def test_refresh_without_a_cookie_is_no_session_and_with_a_forged_one_is_401(api, db):
    assert api.post(REFRESH).status_code == 204
    api.cookies[REFRESH_COOKIE] = "forged"
    assert api.post(REFRESH).status_code == 401


def test_logout_clears_the_cookie(api, user):
    api.post(LOGIN, {"username": "ana", "password": "una-clave-larga-123"})
    response = api.post("/api/v1/auth/logout/")
    assert response.status_code == 204 and response.cookies[REFRESH_COOKIE].value == ""
    assert api.post(REFRESH).status_code == 204  # signed out


def test_wrong_password_sets_no_cookie(api, user):
    response = api.post(LOGIN, {"username": "ana", "password": "otra"})
    assert response.status_code == 401 and REFRESH_COOKIE not in response.cookies


def test_client_routes_get_the_app_and_api_routes_do_not(client, db):
    assert client.get("/subscriptions/42").status_code == 200  # a route of the Angular client
    assert client.get("/api/v1/nope/").status_code == 404


def test_a_missing_file_is_a_404_not_the_app(client, db):
    assert client.get("/main-ABCDEFGH.js").status_code == 404
    assert client.get("/contratos/CO1.PCCNTR.9025726").status_code == 200  # ids with dots are routes, not files


def test_angular_bundles_are_recognised_as_immutable():
    from django.conf import settings

    immutable = settings.WHITENOISE_IMMUTABLE_FILE_TEST
    assert immutable("", "/chunk-4gurq6w1.js") and immutable("", "/main-AB_cd-12.js")
    assert not immutable("", "/index.html") and not immutable("", "/favicon.ico")
