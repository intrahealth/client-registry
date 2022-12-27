FROM opensearchproject/opensearch:2.1.0

RUN /usr/share/opensearch/bin/opensearch-plugin install analysis-phonetic

RUN /usr/share/opensearch/bin/opensearch-plugin install --batch https://github.com/DigitalSQR/record-linkage/releases/download/v2.1.0.0/record-linkage.zip