    // this pipeline do not belong to the shared library pipelines, because there is one repo for the frontend

pipeline {
    agent any

    environment {
        DOCKER_USER = 'junaiduthman'
        APPS = "public-app admin-app"
        IMAGE_TAG = "${env.BUILD_NUMBER}-${GIT_COMMIT.take(7)}"
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
                    withCredentials([usernamePassword(credentialsId: 'docker-hub-creds', passwordVariable: 'PASS', usernameVariable: 'USER')]) {
                        sh 'echo "$PASS" | docker login -u "$USER" --password-stdin'
                        
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

        stage('Update GitOps Manifest') {
                when { branch 'main' }
                steps {
                    script {
                        def gitOpsRepo = "github.com/RealEstate-Rental-JunaidUth-version/K8s-Chart.git"
                        def credentialsId = 'reel-estate-github-app'
                        def newTag = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"

                        withCredentials([usernamePassword(credentialsId: credentialsId, passwordVariable: 'GIT_PASS', usernameVariable: 'GIT_USER')]) {
                            
                            sh 'git clone https://x-access-token:$GIT_PASS@' + gitOpsRepo + ' gitops-temp'
                            dir('gitops-temp') {
                                // TARGETED UPDATE: 
                                // This tells yq to find the app name under 'microservices' and update its 'tag'
                                sh "yq -i '.microservices.\"${config.appName}\".tag = \"${newTag}\"' ./values.yaml"

                                sh """
                                    git config user.email "jenkins@yourdomain.com"
                                    git config user.name "Jenkins CI"
                                    git add values.yaml
                                    git commit -m "chore(deps): update ${config.appName} tag to ${newTag} [skip ci]"
                                    git push https://${GIT_USER}:${GIT_PASS}@${gitOpsRepo} HEAD:main
                                """
                            }
                            sh "rm -rf gitops-temp"
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