#define _GNU_SOURCE
#include <time.h>
#include <sys/time.h>
#include <dlfcn.h>
#include <stdlib.h>
static time_t fixture_time(void) {
  const char *text=getenv("HUB_FIXTURE_UNIX_TIME");
  return text?strtoll(text,0,10):0;
}
time_t time(time_t *out) {
  time_t value=fixture_time();
  if(!value){time_t (*original)(time_t*)=dlsym(RTLD_NEXT,"time");return original(out);}
  if(out)*out=value;return value;
}
int gettimeofday(struct timeval *tv,void *tz) {
  time_t value=fixture_time();
  if(!value){int (*original)(struct timeval*,void*)=dlsym(RTLD_NEXT,"gettimeofday");return original(tv,tz);}
  tv->tv_sec=value;tv->tv_usec=0;return 0;
}
int clock_gettime(clockid_t kind,struct timespec *ts) {
  time_t value=fixture_time();
  if(value&&kind==CLOCK_REALTIME){ts->tv_sec=value;ts->tv_nsec=0;return 0;}
  int (*original)(clockid_t,struct timespec*)=dlsym(RTLD_NEXT,"clock_gettime");return original(kind,ts);
}
