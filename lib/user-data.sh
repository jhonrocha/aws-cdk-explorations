#!/bin/bash
yum update -y
curl -sL https://rpm.nodesource.com/setup_lts.x | bash -
yum install nodejs -y
