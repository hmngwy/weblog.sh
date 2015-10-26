#!/bin/sh

readonly VER="blog-0.2.2"

readonly BRAND="{{BRAND}}"
readonly ENDPOINT="{{ENDPOINT}}"
readonly WEBLOG=".weblog"
readonly LASTID=$HOME/$WEBLOG/lastid
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
  _send "browse" "draft"
  echo "$output"
}

function sub_posts() {
  page=${1}
  _send "browse" "published"
  echo "$output"
}

function sub_write() {

  OPTIND=1

  if [ -z "$1" ] ; then
    : > $WORKSPACE
  elif [ "$1" == "RECOVER" ]; then
    recover=`ls -t "$HISTORYDIR" | head -1`
    echo "[local] → recovering $HISTORYDIR/$recover"
    cat "$HISTORYDIR/$recover" > $WORKSPACE
    OPTIND=2
  elif [[ $1 =~ ^-?[0-9]+$ ]] || [ "$1" == "RECOVER" ]; then
    _send "fetch" $1
    echo "\033[2A"
    id=${output%^^^*}
    content=${output##*^^^}
    # exit
    echo "$content" > $WORKSPACE
    OPTIND=2
  fi

  while getopts ":p" opt; do
    case $opt in
      p)
        publish=true
        ;;
      \?)
        echo "Invalid option: -$OPTARG"
        ;;
    esac
  done

  # launch editor
  $EDITOR $WORKSPACE

  if [ -z  "$1" ] || [ "$1" == "RECOVER" ]; then
    # echo "creating new"
    _send "save" "`cat $WORKSPACE`"
  else
    # echo "updating old"
    _send "save" "`cat $WORKSPACE`" "X-ArticleId:$id"
  fi

  status=${output%^^^*}
  content=${output##*^^^}

  case $status in
    "OK")
      id=${content%---*}
      message=${content##*---}
      echo "$message"
      echo "$id" > $LASTID
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
    _send "save" "`cat $WORKSPACE`"
  else
    _send "save" "`cat $WORKSPACE`" "X-ArticleNum:$2"
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

function sub_publish() {
  if [ -z  "$1" ]; then
    echo "Article num required, follow:"
    echo ""
    echo "    $ProgName publish <num>"
    echo ""
    exit
  elif [ "$1" == "last" ]; then
    target="X-ArticleId:`cat $LASTID`"
  else
    target="X-ArticleNum:$1"
  fi

  _send "status" "published" $target

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
}

function sub_unpublish() {
  if [ -z  "$1" ]; then
    echo "Article num required, follow:"
    echo ""
    echo "    $ProgName publish <num>"
    echo ""
    exit
  elif [ "$1" == "last" ]; then
    target="X-ArticleId:`cat $LASTID`"
  else
    target="X-ArticleNum:$1"
  fi

  _send "status" "draft" $target

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
  _send "delete" $id

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

function _send() {
  action=${1}
  payload=${2}
  if [ -f $TOKEN ]; then
    token=`cat $TOKEN`
    output=`curl -# -H "Content-Type:text/plain" -H "Accept:text/plain" -H "X-Action:$action" -H "User-Agent:$VER" -H "X-Token:$token" -H "$3" -X POST --data-binary "$payload" $ENDPOINT`
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
  echo ""
  echo "$BRAND client - $VER\n"
  echo "Your editor is set to '$EDITOR'. Change your editor by setting"
  echo "EDITOR in your .bashrc file like:\n"
  echo "  EDITOR=nano"
  echo ""
  echo "USAGE: $ProgName <subcommand>\n"
  echo "  Subcommands:"
  echo ""
  echo "    register <username>       Creates a new account"
  echo "    login <username>          You only have to login once"
  echo ""
  echo "    write <num>               Begin new article"
  echo "                              Loads existing if <num> provided"
  echo ""
  echo "    drafts                    Lists saved drafts"
  echo "    posts                     Lists public articles"
  echo ""
  echo "    publish last|<num>        Publishes last or specific article"
  echo "    unpublish last|<num>      Unpublishes last or specific article"
  echo "    delete <num>              Permanently deletes article"
  echo ""
  echo "    push <filename> <num>     Pushes file into blog"
  echo "                              Overwrites article if <num> provided"
  echo ""
  echo "    continue                  Continue writing latest draft"
  echo "    recover                   Loads last edit into workspace"
  echo "                              Use when save fails"
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
