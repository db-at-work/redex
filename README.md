# Redfish Explorer

Created with AI assistance. Using Python for backend, Vue for frontend, and Docker compose to deploy.

## IP, user, password

With these three things known, a session is created and all the Redfish API browsed and cached to the UI for client-side expanding and searching.

The background fetching will collect all posssible data and so presents a bit of a workout to the BMC and will take a while to fully complete. A "Stop Scanning" button, to the left of the yellow flashing (download in progress) indicator, is provided to interrupt this work and allow for manual clicks to initiate data fetching. Any green arrows indicate cached data can be expanded with a click. Yellow arrows indicate a click to expand will fetch data.

