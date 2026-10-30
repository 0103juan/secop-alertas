# A Jenkins controller for trying the pipeline locally: plugins and the job come from files, so it starts ready.
FROM jenkins/jenkins:lts-jdk21
COPY --from=docker:cli /usr/local/bin/docker /usr/local/bin/docker
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
COPY casc.yaml /usr/share/jenkins/ref/casc.yaml
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false" CASC_JENKINS_CONFIG=/usr/share/jenkins/ref/casc.yaml
