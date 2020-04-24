FROM elasticsearch:7.6.2

RUN /usr/share/elasticsearch/bin/elasticsearch-plugin install analysis-phonetic

RUN curl -LO https://github.com/intrahealth/client-registry/blob/master/tools/string-similarity-scoring-0.0.5-es7.6.2.zip?raw=true
RUN mv string-similarity-scoring-0.0.5-es7.6.2.zip?raw=true string-similarity-scoring-0.0.5-es7.6.2.zip
RUN /usr/share/elasticsearch/bin/elasticsearch-plugin install file:./string-similarity-scoring-0.0.5-es7.6.2.zip
