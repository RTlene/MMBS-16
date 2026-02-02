微信支付证书目录
================

请将正式环境证书放到此目录，Docker 会将该目录挂载到容器内的 /app/cert：

  - apiclient_cert.pem  商户 API 证书
  - apiclient_key.pem   商户 API 私钥

放置完成后重启容器即可生效：
  docker-compose down && docker-compose up -d

注意：此目录下的 .pem 文件已加入 .gitignore，不会被提交到仓库。
