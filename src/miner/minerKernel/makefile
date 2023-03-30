extend=./common.cpp
# detect if running under unix by finding 'rm' in $PATH :
ifeq ($(wildcard $(addsuffix /rm,$(subst :, ,$(PATH)))),)
WINMODE=1
else
WINMODE=0
endif

ifeq ($(WINMODE),1)
# native windows setup :
OUTPUTFILE=mineWin32.exe
else
# cross-compile setup :
OUTPUTFILE=mine
LDFLAGS := -lnvidia-ml -L /usr/lib/x86_64-linux-gnu
endif

NVCFLAGS = -O2 --std=c++14 --resource-usage -lineinfo #-g
CUDA_ARCH =  -arch=sm_50 -gencode=arch=compute_50,code=sm_50 -gencode=arch=compute_52,code=sm_52 -gencode=arch=compute_60,code=sm_60 \
-gencode=arch=compute_61,code=sm_61 -gencode=arch=compute_70,code=sm_70 \
-gencode=arch=compute_75,code=sm_75 -gencode=arch=compute_75,code=compute_75
NVCFLAGS += $(CUDA_ARCH)

build: gpu_worker.cu
	nvcc $(NVCFLAGS) $< $(extend) $(LDFLAGS) -o ./$(OUTPUTFILE)

runCU: build
	cat ./test_case_10_16_21_232.txt | ./$(OUTPUTFILE) 2 0 16 21 1000 0 232
