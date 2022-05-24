#ifndef RANDOMBYTES_H
#define RANDOMBYTES_H

#include <openssl/rand.h>

#ifdef __cplusplus
extern "C" {
#endif

int randombytes(unsigned char *x, unsigned long long xlen);

#ifdef __cplusplus
}
#endif

#endif
