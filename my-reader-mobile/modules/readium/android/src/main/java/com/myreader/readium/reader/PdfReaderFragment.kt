package com.myreader.readium.reader

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.commitNow
import androidx.lifecycle.ViewModelProvider
import com.myreader.readium.R
import com.github.barteksc.pdfviewer.PDFView
import org.readium.adapter.pdfium.navigator.PdfiumEngineProvider
import org.readium.adapter.pdfium.navigator.PdfiumPreferences
import org.readium.adapter.pdfium.navigator.PdfiumPreferencesEditor
import org.readium.adapter.pdfium.navigator.PdfiumSettings
import org.readium.r2.navigator.Navigator
import org.readium.r2.navigator.pdf.PdfNavigatorFragment
import org.readium.r2.navigator.pdf.PdfNavigatorFactory
import org.readium.r2.navigator.preferences.Axis
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication

class PdfReaderFragment : VisualReaderFragment(), PdfNavigatorFragment.Listener {

    override lateinit var model: ReaderViewModel
    override lateinit var navigator: Navigator

    private lateinit var factory: ReaderViewModel.Factory
    private var navigatorFactory: PdfNavigatorFactory<PdfiumSettings, PdfiumPreferences, PdfiumPreferencesEditor>? = null
    private var pendingPreferences: PdfiumPreferences? = null
    private lateinit var userPreferences: PdfiumPreferences

    fun initFactory(publication: Publication, initialLocation: Locator?) {
        factory = ReaderViewModel.Factory(publication, initialLocation)
    }

    fun updatePreferences(pdfPreferences: PdfiumPreferences) {
        userPreferences = pdfPreferences

        if (::navigator.isInitialized) {
            (navigator as? PdfNavigatorFragment<PdfiumSettings, PdfiumPreferences>)?.submitPreferences(userPreferences)
            pendingPreferences = null
        } else {
            pendingPreferences = pdfPreferences
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        check(::factory.isInitialized) { "PdfReaderFragment factory was not initialized" }
        ViewModelProvider(this, factory)
            .get(ReaderViewModel::class.java)
            .let { model = it }

        val snap = pendingPreferences?.scrollAxis != Axis.VERTICAL

        navigatorFactory = PdfNavigatorFactory(
            publication = model.publication,
            pdfEngineProvider = PdfiumEngineProvider(
                listener = object : PdfiumEngineProvider.Listener {
                    override fun onConfigurePdfView(configurator: PDFView.Configurator) {
                        configurator
                            .pageSnap(snap)
                            .pageFling(snap)
                    }
                }
            )
        )

        childFragmentManager.fragmentFactory = navigatorFactory!!.createFragmentFactory(
            initialLocator = model.initialLocation,
            initialPreferences = pendingPreferences,
            listener = this
        )
        super.onCreate(savedInstanceState)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = super.onCreateView(inflater, container, savedInstanceState)
        val tag = getString(R.string.pdf_navigator_tag)
        if (savedInstanceState == null) {
            childFragmentManager.commitNow {
                add(R.id.fragment_reader_container, PdfNavigatorFragment::class.java, Bundle(), tag)
            }
        }
        navigator = childFragmentManager.findFragmentByTag(tag) as Navigator

        pendingPreferences?.let { updatePreferences(it) }

        return view
    }

    companion object {
        fun newInstance() = PdfReaderFragment()
    }
}
