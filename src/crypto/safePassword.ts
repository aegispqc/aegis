class SafePasswordBuf {
	private buf?: Buffer;
	private autoFreeTime: number;
	private time?: ReturnType <typeof setTimeout>;
	constructor(buf: Buffer, autoFreeTime: number = 5000) {
		this.buf = buf;
		this.autoFreeTime = autoFreeTime;
		this.timeStart();
	}

	private timeStart() {
		if(this.time) {
			clearTimeout(this.time);
		}
		this.time = setTimeout( ()=> {
			this.free();
		}, this.autoFreeTime)
	}

	free() {
		if(this.buf) {
			this.buf.fill(0);
			delete this.buf;
		}
		clearTimeout(this.time);
	}

	get data(){
		if(!this.buf) {
			console.error('ERROR: buf is free!');
			return undefined;
		}
		this.timeStart();
		return this.buf;
	}
}

export { SafePasswordBuf };