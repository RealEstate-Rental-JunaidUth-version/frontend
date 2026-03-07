    // this pipeline do not belong to the shared library pipelines, because there is one repo for the frontend

pipeline {
    agent any

    environment {
        DOCKER_USER = 'junaiduthman'
        APPS = "public-app admin-app"
        IMAGE_TAG = "${GIT_COMMIT.take(7)}"
        NODE_OPTIONS = "--max-old-space-size=4096"
    }

    tools {
        nodejs 'node-20'
    }

    stages {
        stage('Initialize (Deep Clone)') {
            steps {
                cleanWs()
                checkout([
                    $class: 'GitSCM',
                    branches: scm.branches,
                    extensions: [[$class: 'CloneOption', shallow: false, depth: 0]],
                    userRemoteConfigs: scm.userRemoteConfigs
                ])
                sh 'git fetch --all'
            }
        }

        stage('Install & Test') {
            steps {
                sh 'npm ci --legacy-peer-deps'
                // Run tests for everything on every PR
                sh 'npx nx affected --target=test --base=origin/main --head=HEAD'
            }
        }

        stage('Nx Build (Affected)') {
            steps {
                script {
                    def baseRef = env.BRANCH_NAME == 'main' ? 'HEAD~1' : 'origin/main'
                    try {
                        sh "npx nx affected:build --base=${baseRef} --head=HEAD --configuration=production"
                    } catch (Exception e) {
                        echo "⚠️ Nx n'a détecté aucune modification à builder."
                    }
                }
            }
        }

        stage('Docker Build & Push') {
            when { branch 'main' }
            steps {
                script {
                    withCredentials([usernamePassword(credentialsId: 'DOCKER_HUB', passwordVariable: 'DOCKER_PASS', usernameVariable: 'DOCKER_USER_CRED')]) {
                        sh 'echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER_CRED" --password-stdin'
                        
                        APPS.split(' ').each { appName ->
                            if (fileExists("dist/apps/${appName}")) {
                                echo "🚀 Deploying ${appName}..."
                                sh "docker build -t ${DOCKER_USER}/${appName}:${IMAGE_TAG} -t ${DOCKER_USER}/${appName}:latest --build-arg APP_NAME=${appName} ."
                                sh "docker push ${DOCKER_USER}/${appName}:${IMAGE_TAG}"
                                sh "docker push ${DOCKER_USER}/${appName}:latest"
                            }
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs()
            sh "docker system prune -f" 
        }
    }
}