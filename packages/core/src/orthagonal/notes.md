orthagonal loading and freshness goals

each time a user runs a query, we want to:

revalidate current view of every index's meta file, if-modified-since style

if the buildID has changed, all the other requested columns should be reloaded as well.

columns that aren't needed for this search can be left as is, i guess, or evicted from memory as soon as it's known they're out of date. doesn't matter.

The important thing is every used search library reloads it's meta json (with browser cache) on every search/pagination, and then when it's loaded, all the columns are checked for buildID equality.

Also, any cache of shards should be evicted any time buildID changes.

vectors could be reloaded any time a vector indexed column updates, or only when a cache miss happens. Or there could be a threshold for how many cache misses justifies reloading the vector cache versus just fetching them from the vector db client side. 5 to 10 would probably be a reasonable value?

-- other concerns --

some queries end up reading the shards fairly linearly, sometimes you see 8 requests go out for the same shard. that's pointless and silly. Maybe worth thinking about ways to consolidate that. Maybe all the load requests can go in to a pool and coalessed together after a timeout or microtask?