# weblog.sh
__Blog from the Command Line — https://weblog.sh/__

[https://weblog.sh](https://weblog.sh) is a hosted blogging service that lets you blog from the command line, it provides the server hosting for the pages, and the CLI client to create content.

This repository — weblog.sh — contains the source code for the site.

The aim of the site is to provide a polar opposite of rich interface blogging platforms while still allowing for the core blogging functionalities. The hosting service is provided to reduce the need for the user to build and host their own sites.

### About the hosting service <<https://weblog.sh>>

The features are minimal. You get a home page, which shows an index of all your posts, and a page for each article.

As for personalization, you have one setting, and only once - your username.

An Atom feed is also provided.

Users are anonymous, no information is explicitly requested other than the preferred username.

### About the blogging client

All interaction with your blog is through this client, from registration, through article publishing, to article deletion, the site's homepage outlines all the commands.

When you start or edit an article, the client will launch your $EDITOR, if you have not set it please see instructions in doing so for your operating system.

### About the source code

Basically each client version will activate a corresponding lib script that contains all the commands available for that version, the client version corresponds to the script name. The command definitions are exclusive to each version but there is interest to keep it consistent with future versions.

Only the schemas are permanently consistent across versions.

The server does not use REST in the interest of brevity.

Other than that, it's mostly a basic Mongo+Express web app.

## Contributing

- Pick up one of the to-do items below and send me a pull request
- Report bugs using [Github Issues](https://github.com/hmngwy/weblog.sh/issues)
  - Also welcome: suggestions, opinion, open discussions
- Support through ♥︎Gratipay (Soon)

I am figuring out the policies needed to allow people in as Repo Contributors. I will disclose that soon.

### DO THIS

- Add a **TOS** and **PP** pages, loosely base on WP
- Add **About** page
  - Discuss how the client works
  - Discuss need to knows, like certs from startssl and basic token based auth
  - Cookie notice
  - Contact information
  - Policies and Disclaimers
- Move the #About sections in README to wiki and link to it
- Add GPL notice to client on registration
- Add TOS and PP to client
- Redis page caching
  - exclude client download page, invalidate user-specific cache on update
- Simplify post status update function (publish, unpublish, delete)
- Look into better authentication systems for CLI programs
- Custom domain support

## Getting in touch
postmaster at weblog•sh

### LEGAL

GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

**weblog.sh - hosted blogging service managed through a provided command line interface client**

Copyright (C) 2015 Conrado Patricio Ambrosio

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
