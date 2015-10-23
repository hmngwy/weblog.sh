#!/bin/sh

readonly VER="blog-0.1.1"

readonly BRAND="{{BRAND}}"
readonly ENDPOINT="{{ENDPOINT}}"
readonly WEBLOG=".weblog"
readonly TOKEN=$HOME/$WEBLOG/token
readonly WORKSPACE=$HOME/$WEBLOG/workspace
readonly HISTORYDIR=$HOME/$WEBLOG/history

ProgName=$(basename $0)
subcommand=$1

function _setup() {
  mkdir -p $HOME/.weblog
  mkdir -p $HOME/.weblog/history
}

function sub_register() {
  if [ -z  "$1" ]; then
    echo "Username required, follow:"
    echo ""
    echo "    $ProgName register <username>"
    echo ""
    exit
  fi

  username=${1}

  # ask for password
  echo "There is no password recovery, set carefully."
  printf "Create password for $username: "
  read -s password;

  # send registration
  _sendNoAuth "register" "$username|$password"

  # save output to ~/.weblog/token if OK
  status=${output%^^^*}
  tokencontent=${output##*^^^}

  echo ""

  case $status in
    "OK")
      content=${tokencontent%---*}
      token=${tokencontent##*---}
      echo "$content"
      echo "$token" > $TOKEN
      ;;
    "TAKEN")
      echo "Username taken, try another."
      ;;
    "BAD")
      echo "$tokencontent";
      ;;
    *)
      echo "An unknown error has occured, maybe try again?"
      ;;
  esac

}

function sub_login() {
  if [ -z  "$1" ]; then
    echo "Username required, follow:"
    echo ""
    echo "    $ProgName register <username>"
    echo ""
    exit
  fi

  username=${1}

  # ask for password
  printf "Password for $username: "
  read -s password;

  # check login
  _sendNoAuth "login" "$username|$password"

  # save output to ~/.weblog/token

  # save output to ~/.weblog/token if OK
  status=${output%^^^*}
  tokencontent=${output##*^^^}

  echo ""

  case $status in
    "OK")
      content=${tokencontent%---*}
      token=${tokencontent##*---}
      echo "$content"
      echo "$token" > $TOKEN
      ;;
    "BAD")
      echo "$tokencontent"
      ;;
    *)
      echo "An unknown error has occured, maybe try again?"
      ;;
  esac

}

function sub_drafts() {
  page=${1}
  _send "browse" "draft" "fetching"
  echo "$output"
}


function sub_posts() {
  page=${1}
  _send "browse" "published" "fetching"
  echo "$output"
}

function sub_publish() {
  if [ -z  "$1" ]; then
    echo "Article num required, follow:"
    echo ""
    echo "    $ProgName publish <num>"
    echo ""
    exit
  fi

  id=${1}

  _send "publish" $id "publishing"

  status=${output%^^^*}
  content=${output##*^^^}

  case $status in
    "OK")
      # echo "Login successful. Welcome back. "
      echo "$content"
      ;;
    "BAD")
      echo "$content"
      ;;
    *)
      echo "An unknown error has occured, maybe try again?"
      ;;
  esac
}

function sub_unpublish() {
  if [ -z  "$1" ]; then
    echo "Article num required, follow:"
    echo ""
    echo "    $ProgName unpublish <num>"
    echo ""
    exit
  fi

  id=${1}
  _send "unpublish" $id "unpublishing"

  status=${output%^^^*}
  content=${output##*^^^}

  case $status in
    "OK")
      # echo "Login successful. Welcome back. "
      echo "$content"
      ;;
    "BAD")
      echo "$content"
      ;;
    *)
      echo "An unknown error has occured, maybe try again?"
      ;;
  esac
}

function sub_delete() {
  if [ -z  "$1" ]; then
    echo "Article num required, follow:"
    echo ""
    echo "    $ProgName delete <num>"
    echo ""
    exit
  fi

  id=${1}
  _send "delete" $id "deleting"

  status=${output%^^^*}
  content=${output##*^^^}

  case $status in
    "OK")
      # echo "Login successful. Welcome back. "
      echo "$content"
      ;;
    "BAD")
      echo "$content"
      ;;
    *)
      echo "An unknown error has occured, maybe try again?"
      ;;
  esac
}

function sub_write() {
  if [ -z "$1" ]; then
    : > $WORKSPACE
  elif [ "$1" == "RECOVER" ]; then
    recover=`ls -t "$HISTORYDIR" | head -1`
    echo "[local] → recovering $HISTORYDIR/$recover"
    cat "$HISTORYDIR/$recover" > $WORKSPACE
  else
    _send "fetch" $1 "loading article"
    echo "\033[3A"
    id=${output%^^^*}
    content=${output##*^^^}
    # exit
    echo "$content" > $WORKSPACE

  fi

  # launch editor
  $EDITOR $WORKSPACE

  if [ -z  "$1" ] || [ "$1" == "RECOVER" ]; then
    # echo "creating new"
    _send "save" "`cat $WORKSPACE`" "saving"
  else
    # echo "updating old"
    _send "save" "`cat $WORKSPACE`" "updating"  "X-ArticleId:$id"
  fi

  status=${output%^^^*}
  content=${output##*^^^}

  case $status in
    "OK")
      echo "$content"
      ;;
    "BAD")
      echo "$content"
      ;;
    *)
      echo "An unknown error has occured, maybe try again?"
      ;;
  esac

  # then move it to history
  date=`date +%Y-%m-%d-%H-%M-%S`

  if [ "$1" == "RECOVER" ]; then
    cat $WORKSPACE > "$HISTORYDIR/$recover"
    echo "[local] → backup updated $HISTORYDIR/$recover"
  else
    cat $WORKSPACE > "$HISTORYDIR/$date"
    echo "[local] → backup saved as \"~/$WEBLOG/history/$date\""
  fi
  echo ""
}

function sub_continue() {
  # fetch latest article
  sub_write "LAST"
}

function sub_push() {

  if [ -z  "$1" ]; then
    echo "Filename required, follow:"
    echo ""
    echo "    $ProgName push <filename>"
    echo ""
    exit
  fi

  cat "$1" > $WORKSPACE

  if [ -z  "$2" ]; then
    _send "save" "`cat $WORKSPACE`" "pushing new"
  else
    _send "save" "`cat $WORKSPACE`" "pushing update" "X-ArticleNum:$2"
  fi

  status=${output%^^^*}
  content=${output##*^^^}

  case $status in
    "OK")
      echo "$content"
      ;;
    "BAD")
      echo "$content"
      ;;
    *)
      echo "An unknown error has occured, maybe try again?"
      ;;
  esac

  # then move it to history
  date=`date +%Y-%m-%d-%H-%M-%S`
  cat $WORKSPACE > "$HISTORYDIR/$date"
  echo "Backup saved as \"~/$WEBLOG/history/$date\""
  echo ""
}

function sub_recover() {
  # fetch latest article
  sub_write "RECOVER"
}

function _send() {
  action=${1}
  payload=${2}
  if [ -f $TOKEN ]; then
    echo "\r\033[K[local] → $3"
    token=`cat $TOKEN`
    output=`curl -# -H "Content-Type:text/plain" -H "Accept:text/plain" -H "X-Action:$action" -H "User-Agent:$VER" -H "X-Token:$token" -H "$4" -X POST --data-binary "$payload" $ENDPOINT`
  else
    echo "Login or register first using: weblog login/register"
  fi

}

# for register, login
function _sendNoAuth() {
  action=${1}
  payload=${2}
  output=`curl -s -H "Content-Type:text/plain" -H "X-Action:$action" -H "User-Agent:$VER" -X POST --data "$payload" $ENDPOINT`
}

sub_help(){
  echo "$BRAND client - $VER\n"
  echo "Usage: $ProgName <subcommand> [options]\n"
  echo "Subcommands:"
  echo ""
  echo "    register <username>       Creates a new account"
  echo "    login <username>          Logs into account"
  echo ""
  echo "    write <num>               Creates new article"
  echo "                              If <num> provided, loads article"
  echo "    continue                  Continue writing latest draft"
  echo ""
  echo "    push <filename> <num>     Pushes file into blog"
  echo "                              If <num> provided, overwrites article"
  echo ""
  echo "    recover                   Loads local file into workspace"
  echo "                              Use when save fails"
  echo ""
  echo "    drafts                    Lists drafts"
  echo "    posts                     Lists public articles"
  echo ""
  echo "    publish <num>             Publishes article"
  echo "    unpublish <num>           Unpublishes article, becomes draft"
  echo "    delete <num>              Permanently deletes article"
  echo ""

}

_setup

subcommand=$1
case $subcommand in
  "" | "-h" | "--help")
    sub_help
    ;;
  *)
    shift
    sub_${subcommand} $@
    if [ $? = 127 ]; then
        echo "Error: '$subcommand' is not a known subcommand." >&2
        echo "       Run '$ProgName --help' for a list of known subcommands." >&2
        exit 1
    fi
    ;;
esac
