def test_probes_answer_with_the_host_cloud_run_uses(client, db, settings):
    settings.ALLOWED_HOSTS = [".run.app"]
    assert client.get("/healthz", HTTP_HOST="127.0.0.1").status_code == 200
    assert client.get("/readyz", HTTP_HOST="127.0.0.1").json() == {"status": "ok"}
    assert client.get("/", HTTP_HOST="127.0.0.1").status_code == 400  # everything else still checks the host
    assert client.get("/", HTTP_HOST="secop-alertas-x-uc.a.run.app").status_code == 200
