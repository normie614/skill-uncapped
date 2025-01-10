const rgx = /([a-z0-9]{10})(:?\/|$)/g;
const CHUNK_SIZE = 10;
let hls = null;

// Initialize HLS
if (Hls.isSupported()) {
	const hlsjsConfig = {
		"maxBufferSize": 0,
		"maxBufferLength": 30,
		"startPosition": 0
	};
	hls = new Hls(hlsjsConfig);
	hls.on(Hls.Events.MANIFEST_PARSED, function () {
		video.play();
	});
}

async function findLastPart(videoId, resolution) {
	let start = 0;
	let end = 1000;
	let last = 0;

	while (start <= end) {
		const mid = Math.floor((start + end) / 2);
		try {
			const response = await fetch(
				`https://d13z5uuzt1wkbz.cloudfront.net/${videoId}/HIDDEN${resolution}-${String(mid).padStart(5, "0")}.ts`
			);
			if (response.status === 200) {
				last = mid;
				start = mid + 1;
			} else {
				end = mid - 1;
			}
		} catch {
			end = mid - 1;
		}
	}
	return last;
}

async function stream() {
	if (hls == null) {
	  alert("HLS not supported, please use a modern browser such as Chrome");
	  return;
	}

	let rawUrl = document.getElementById("url").value;
	rawUrl = rawUrl.replace(/\/[^/]*$/, '');
	let ids = [];
	let match = null;

	while ((match = rgx.exec(rawUrl)) !== null) {
	  ids.push(match[1]);
	}

	if (ids.length < 1) {
	  alert("Invalid URL");
	  return;
	}

	const videoId = rawUrl.includes("browse3") ? ids[0] : ids[ids.length - 1];
	let statusLabel = document.getElementById("status");

	console.log(`Video ID is ${videoId}`);
	console.log("Looking for the final part...");
	let last = 0;
	let jump = true;

	for (let i = 300; i <= 1000; i++) {
	  if (i == 1000) {
		alert("Error finding the last part");
		return;
	  }

	  if (i == 0) i = 1;

	  const url = `https://d13z5uuzt1wkbz.cloudfront.net/${videoId}/HIDDEN4500-${String(i).padStart(5, "0")}.ts`;
	  console.log(`Testing ${url}`);
	  statusLabel.innerText = `Looking for the final part; Testing ${i}...`;
	  try {
		const resp = await fetch(url, { method: 'HEAD' });
		if (resp.status === 403) {
		  if (i >= 50 && i % 50 === 0 && jump) {
			last = i;
			jump = true;
			i -= 51;
			continue;
		  }

		  break;
		}
		last = i;
		jump = false;
	  } catch (e) {
		alert("Fetch failed, please install a Cross-Origin disabler extension for your browser or check your internet connectivity.");
		return;
	  }
	}

	statusLabel.innerText = "";

	let data = "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-TARGETDURATION:10";
	for (let i = 0; i <= last; i++) {
	  data += `#EXTINF:10,\nhttps://d13z5uuzt1wkbz.cloudfront.net/${videoId}/HIDDEN4500-${String(i).padStart(5, "0")}.ts\n`
	}

	console.log(data);

	hls.loadSource("data:application/x-mpegURL;base64," + btoa(data));
	hls.attachMedia(video);
}

async function downloadAndMergeVideo() {
	const statusEl = document.getElementById("status");
	const progressBar = document.querySelector('.progress-bar');
	const progressBarFill = document.querySelector('.progress-bar-fill');
	const videoName = document.getElementById("videoName").value;
	const resolution = document.getElementById("resolution").value;

	if (!videoName) {
		statusEl.textContent = "Please enter a video name";
		return;
	}

	const rawUrl = document.getElementById("url").value.replace(/\/[^/]*$/, '');
	const ids = [...rawUrl.matchAll(rgx)].map(match => match[1]);

	if (ids.length < 1) {
		statusEl.textContent = "Invalid URL";
		return;
	}

	const videoId = rawUrl.includes("browse3") ? ids[0] : ids[ids.length - 1];
	progressBar.style.display = 'block';
	statusEl.textContent = "Finding video parts...";

	try {
		const lastPart = await findLastPart(videoId, resolution);
		const tsContents = [];
		let downloadedCount = 0;

		for (let i = 0; i <= lastPart; i += CHUNK_SIZE) {
			const chunk = [];
			for (let j = 0; j < CHUNK_SIZE && (i + j) <= lastPart; j++) {
				const url = `https://d13z5uuzt1wkbz.cloudfront.net/${videoId}/HIDDEN${resolution}-${String(i + j).padStart(5, "0")}.ts`;
				chunk.push(fetch(url).then(resp => resp.arrayBuffer()));
			}

			const results = await Promise.allSettled(chunk);
			results.forEach(result => {
				if (result.status === 'fulfilled') {
					tsContents.push(result.value);
				}
			});

			downloadedCount += chunk.length;
			const progress = (downloadedCount / (lastPart + 1)) * 100;
			progressBarFill.style.width = `${progress}%`;
			statusEl.textContent = `Downloaded ${downloadedCount} of ${lastPart + 1} parts`;
		}

		const blob = new Blob(tsContents, { type: 'video/mp2t' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `${videoName}.ts`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		statusEl.textContent = "Download complete!";
		setTimeout(() => {
			statusEl.textContent = "";
			progressBar.style.display = 'none';
			progressBarFill.style.width = '0%';
		}, 3000);
	} catch (error) {
		console.error('Download error:', error);
		statusEl.textContent = "Download failed. Please try again.";
		progressBar.style.display = 'none';
	}
}