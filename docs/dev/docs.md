# Building Documentation

This documentation is built using [MkDocs](https://www.mkdocs.org/) and the [Material for MkDocs theme](https://squidfunk.github.io/mkdocs-material/).

PDF export is done using [mkdocs-pdf-export-plugin](https://github.com/zhaoterryy/mkdocs-pdf-export-plugin). All configuration information is in mkdocs.yaml in the [repository](https://github.com/intrahealth/client-registry-docs/). Note that at some future time the docs may be migrated into the main [client registry repository](https://github.com/intrahealth/client-registry).

Edits to docs are made in the master branch of the [client registry repository docs repo](https://github.com/intrahealth/client-registry). 

After docs are edited, they are pushed to origin master, and then the `mkdocs gh-deploy` is run on the command line. This pushes into the gh-pages branch on GitHub. Only master is ever edited. The gh-pages is only modified by the CLI. 