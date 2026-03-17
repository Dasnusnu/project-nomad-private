import { Head } from '@inertiajs/react'
import StyledTable from '~/components/StyledTable'
import SettingsLayout from '~/layouts/SettingsLayout'
import StyledButton from '~/components/StyledButton'
import { useModals } from '~/context/ModalContext'
import StyledModal from '~/components/StyledModal'
import { FileEntry } from '../../../types/files'
import { useNotifications } from '~/context/NotificationContext'
import api from '~/lib/api'
import DownloadURLModal from '~/components/DownloadURLModal'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import useDownloads from '~/hooks/useDownloads'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import CuratedCollectionCard from '~/components/CuratedCollectionCard'
import type { CollectionWithStatus } from '../../../types/collections'
import ActiveDownloads from '~/components/ActiveDownloads'

const CURATED_COLLECTIONS_KEY = 'curated-routing-collections'

export default function RoutingManager(props: {
  routing: { pbfFiles: FileEntry[] }
}) {
  const queryClient = useQueryClient()
  const { openModal, closeAllModals } = useModals()
  const { addNotification } = useNotifications()

  const { data: curatedCollections } = useQuery({
    queryKey: [CURATED_COLLECTIONS_KEY],
    queryFn: () => api.listCuratedRoutingCollections(),
    refetchOnWindowFocus: false,
  })

  const { data: pbfFiles, refetch: refetchPbfFiles } = useQuery({
    queryKey: ['routing-pbf-files'],
    queryFn: () => api.listRoutingPbfFiles(),
    initialData: props.routing.pbfFiles,
    refetchOnWindowFocus: false,
  })

  const { invalidate: invalidateDownloads } = useDownloads({
    filetype: 'routing',
    enabled: true,
  })

  async function downloadCollection(record: CollectionWithStatus) {
    try {
      await api.downloadRoutingCollection(record.slug)
      invalidateDownloads()
      addNotification({
        type: 'success',
        message: `Download for collection "${record.name}" has been queued. Valhalla will restart automatically when complete to rebuild routing tiles.`,
      })
    } catch (error) {
      console.error('Error downloading collection:', error)
    }
  }

  async function downloadCustomFile(url: string) {
    try {
      await api.downloadRemoteRoutingFile(url)
      invalidateDownloads()
      addNotification({
        type: 'success',
        message: 'Download has been queued. Valhalla will restart automatically when complete.',
      })
    } catch (error) {
      console.error('Error downloading custom file:', error)
    }
  }

  async function confirmDeleteFile(file: FileEntry) {
    openModal(
      <StyledModal
        title="Confirm Delete?"
        onConfirm={async () => {
          closeAllModals()
          try {
            await api.deleteRoutingFile(file.name)
            addNotification({
              type: 'success',
              message: `${file.name} deleted. Valhalla will restart to rebuild routing tiles.`,
            })
            refetchPbfFiles()
            queryClient.invalidateQueries({ queryKey: [CURATED_COLLECTIONS_KEY] })
          } catch (error) {
            console.error('Error deleting file:', error)
            addNotification({
              type: 'error',
              message: 'Failed to delete routing file. Please try again.',
            })
          }
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      >
        <p className="text-gray-700">
          Are you sure you want to delete {file.name}? Valhalla will restart and rebuild its routing
          tiles from the remaining files. This action cannot be undone.
        </p>
      </StyledModal>,
      'confirm-delete-file-modal'
    )
  }

  async function confirmDownload(record: CollectionWithStatus) {
    openModal(
      <StyledModal
        title="Confirm Download?"
        onConfirm={() => {
          if (record.all_installed) {
            addNotification({
              message: `All resources in the collection "${record.name}" have already been downloaded.`,
              type: 'info',
            })
            closeAllModals()
            return
          }
          downloadCollection(record)
          closeAllModals()
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Download"
        cancelText="Cancel"
        confirmVariant="primary"
      >
        <p className="text-gray-700">
          Are you sure you want to download <strong>{record.name}</strong>? It may take some time
          depending on the file size and your internet connection. Valhalla will restart
          automatically to rebuild its routing tiles when the download completes.
        </p>
      </StyledModal>,
      'confirm-download-file-modal'
    )
  }

  async function openDownloadModal() {
    openModal(
      <DownloadURLModal
        title="Download Routing Data File"
        suggestedURL="e.g. https://download.geofabrik.de/north-america/us/nevada-latest.osm.pbf"
        fileTypeLabel="OSM PBF routing data"
        preflightFn={(url) => api.downloadRemoteRoutingFilePreflight(url)}
        onCancel={() => closeAllModals()}
        onPreflightSuccess={async (url) => {
          await downloadCustomFile(url)
          closeAllModals()
        }}
      />,
      'download-routing-file-modal'
    )
  }

  const refreshCollections = useMutation({
    mutationFn: () => api.fetchLatestRoutingCollections(),
    onSuccess: () => {
      addNotification({
        message: 'Successfully refreshed routing collections.',
        type: 'success',
      })
      queryClient.invalidateQueries({ queryKey: [CURATED_COLLECTIONS_KEY] })
    },
  })

  return (
    <SettingsLayout>
      <Head title="Routing Data Manager" />
      <div className="xl:pl-72 w-full">
        <main className="px-12 py-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-4xl font-semibold mb-2">Routing Data Manager</h1>
              <p className="text-gray-500">
                Download OSM PBF files for offline turn-by-turn directions. Valhalla automatically
                rebuilds its routing graph after each download or deletion.
              </p>
            </div>
          </div>
          <div className="mt-8 mb-6 flex items-center justify-between">
            <StyledSectionHeader title="Curated Routing Regions" className="!mb-0" />
            <StyledButton
              onClick={() => refreshCollections.mutate()}
              disabled={refreshCollections.isPending}
              icon="IconRefresh"
            >
              Force Refresh Collections
            </StyledButton>
          </div>
          <div className="!mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {curatedCollections?.map((collection) => (
              <CuratedCollectionCard
                key={collection.slug}
                collection={collection}
                onClick={(collection) => confirmDownload(collection)}
              />
            ))}
            {curatedCollections && curatedCollections.length === 0 && (
              <p className="text-gray-500">No curated collections available.</p>
            )}
          </div>
          <div className="mt-12 mb-6 flex items-center justify-between">
            <StyledSectionHeader title="Downloaded PBF Files" className="!mb-0" />
            <StyledButton
              variant="primary"
              onClick={openDownloadModal}
              icon="IconCloudDownload"
            >
              Download a Custom PBF File
            </StyledButton>
          </div>
          <StyledTable<FileEntry & { actions?: any }>
            className="font-semibold mt-4"
            rowLines={true}
            loading={false}
            compact
            columns={[
              { accessor: 'name', title: 'Name' },
              {
                accessor: 'actions',
                title: 'Actions',
                render: (record) => (
                  <div className="flex space-x-2">
                    <StyledButton
                      variant="danger"
                      icon="IconTrash"
                      onClick={() => confirmDeleteFile(record)}
                    >
                      Delete
                    </StyledButton>
                  </div>
                ),
              },
            ]}
            data={pbfFiles || []}
          />
          <ActiveDownloads filetype="routing" withHeader />
        </main>
      </div>
    </SettingsLayout>
  )
}
