// The same checks as .github/workflows/ci.yml, as a Jenkins declarative pipeline, plus a gated deploy to Cloud Run.
//
// Every tool runs in a container, so the agent only needs Docker: Postgres as a sidecar for the tests, uv's image for
// Python, the Cloud SDK image for the deploy. Run it locally with ci/jenkins (see ci/jenkins/README.md).

pipeline {
    agent any

    parameters {
        booleanParam(name: 'DEPLOY', defaultValue: false, description: 'Push the image and roll it out to Cloud Run')
        string(name: 'GCP_PROJECT', defaultValue: 'secop-analyst-demo-2610', description: 'Project to deploy to')
        string(name: 'REGION', defaultValue: 'us-central1', description: 'Cloud Run region')
    }

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()          // two builds of the same branch would race on the deploy
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        UV_CACHE_DIR = "${WORKSPACE}/.uv-cache"   // inside the workspace, so the cache survives between stages
        IMAGE_TAG = "${env.GIT_COMMIT?.take(12) ?: env.BUILD_NUMBER}"
    }

    stages {
        stage('Test') {
            steps {
                script {
                    // A throwaway Postgres for this build only. The test container joins its network namespace, so
                    // the database is on localhost and no port is published on the agent.
                    docker.image('postgres:17-alpine').withRun('-e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=alertas') { db ->
                        docker.image('ghcr.io/astral-sh/uv:python3.13-bookworm-slim').inside(
                            "--network container:${db.id} -e HOME=${WORKSPACE} " +
                            "-e DATABASE_URL=postgresql://postgres:postgres@localhost:5432/alertas"
                        ) {
                            sh 'uv sync --locked'
                            sh 'for i in $(seq 30); do DEBUG=1 uv run python manage.py check --database default -v0 && break; sleep 1; done'
                            sh 'uv run ruff check . && uv run ruff format --check .'
                            sh 'DEBUG=1 uv run python manage.py makemigrations --check --dry-run'
                            sh 'uv run pytest --junitxml=reports/junit.xml'
                        }
                    }
                }
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/junit.xml'
                }
            }
        }

        stage('Image') {
            steps {
                sh 'docker build --pull --label ci.pipeline=secop-alertas -t secop-alertas:${IMAGE_TAG} .'
            }
        }

        stage('Deploy') {
            when {
                beforeInput true
                expression { params.DEPLOY }
            }
            input {
                message 'Roll this build out to Cloud Run?'
                ok 'Deploy'
            }
            environment {
                REPOSITORY = "${params.REGION}-docker.pkg.dev/${params.GCP_PROJECT}/secop-alertas/web"
            }
            steps {
                // ponytail: a service-account key stored in Jenkins. Workload Identity Federation (Jenkins as an OIDC
                // issuer) removes the key; worth it once Jenkins deploys more than one service.
                withCredentials([file(credentialsId: 'gcp-deployer', variable: 'GOOGLE_APPLICATION_CREDENTIALS')]) {
                    sh '''
                        docker tag secop-alertas:${IMAGE_TAG} ${REPOSITORY}:${IMAGE_TAG}
                        docker run --rm -v "$GOOGLE_APPLICATION_CREDENTIALS:/key.json:ro" gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
                            gcloud auth print-access-token --cred-file=/key.json \
                          | docker login -u oauth2accesstoken --password-stdin https://${REGION}-docker.pkg.dev
                        docker push ${REPOSITORY}:${IMAGE_TAG}
                    '''
                    // Terraform owns the service and ignores its image (deploy/gcp/main.tf); the pipeline owns the image.
                    sh '''
                        docker run --rm -v "$GOOGLE_APPLICATION_CREDENTIALS:/key.json:ro" -e CLOUDSDK_CORE_PROJECT=${GCP_PROJECT} \
                            gcr.io/google.com/cloudsdktool/google-cloud-cli:slim sh -c "
                            gcloud auth login --cred-file=/key.json --quiet &&
                            gcloud run jobs update alertas-ingest --region ${REGION} --image ${REPOSITORY}:${IMAGE_TAG} &&
                            gcloud run services update secop-alertas --region ${REGION} --container web --image ${REPOSITORY}:${IMAGE_TAG}"
                    '''
                }
            }
        }
    }

    post {
        always {
            // Only this pipeline's own images, older than three days: the agent's Docker may be shared.
            sh 'docker image prune -af --filter "label=ci.pipeline=secop-alertas" --filter "until=72h" || true'
        }
    }
}
