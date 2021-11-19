FROM elasticsearch:7.9.1

RUN /usr/share/elasticsearch/bin/elasticsearch-plugin install analysis-phonetic

RUN curl -LO https://github.com/intrahealth/client-registry/blob/master/tools/string-similarity-scoring-0.0.6-es7.9.1.zip?raw=true
RUN mv string-similarity-scoring-0.0.6-es7.9.1.zip?raw=true string-similarity-scoring-0.0.6-es7.9.1.zip
RUN /usr/share/elasticsearch/bin/elasticsearch-plugin install file:./string-similarity-scoring-0.0.6-es7.9.1.zip
